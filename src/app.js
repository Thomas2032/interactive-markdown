/**
 * Interactive Markdown — editor + live preview shell.
 */

import { mountDocumentEditor } from "./document-editor.js";
import { renderDocument } from "./markdown.js";
import { replaceIvmFence } from "./parse-ivm.js";
import { attachAutocomplete } from "./autocomplete.js";

const STORAGE_KEY = "interactive-markdown-draft-v1";

const editor = document.getElementById("editor");
const graphEditorEl = document.getElementById("graph-editor");
const preview = document.getElementById("preview");
const statusEl = document.getElementById("status");
const btnOpen = document.getElementById("btn-open");
const btnSave = document.getElementById("btn-save");
const btnClear = document.getElementById("btn-clear");
const fileInput = document.getElementById("file-input");
const exampleSelect = document.getElementById("example-select");
const tabSource = document.getElementById("tab-source");
const tabGraph = document.getElementById("tab-graph");

/** @type {{ destroy: () => void } | null} */
let previewMount = null;
/** @type {{ destroy: () => void } | null} */
let graphMount = null;
let debounceTimer = 0;
let dirty = false;
/** Shared control values across Preview and Graph editor mounts. */
const sharedEnvStore = new Map();
/** Shared @ns maps across Preview and Graph editor mounts. */
const sharedNamespaces = new Map();

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function persistDraft() {
  dirty = true;
  try {
    localStorage.setItem(STORAGE_KEY, editor.value);
  } catch (_) {
    /* ignore quota */
  }
}

function showPreviewError(err) {
  preview.innerHTML = `<div class="im-errors">${escapeHtml(err.message || String(err))}</div>`;
  setStatus("Render error");
  console.error(err);
}

function renderPreview() {
  if (previewMount) {
    previewMount.destroy();
    previewMount = null;
  }
  previewMount = renderDocument(preview, editor.value, {
    envStore: sharedEnvStore,
    namespaces: sharedNamespaces,
    onGraphChange(fenceIndex, body) {
      editor.value = replaceIvmFence(editor.value, fenceIndex, body);
      persistDraft();
      setStatus("Graph updated");
      refreshGraphEditor();
    },
  });
}

function refreshGraphEditor() {
  if (!graphEditorEl) return;
  if (graphMount) {
    graphMount.destroy();
    graphMount = null;
  }
  graphMount = mountDocumentEditor(graphEditorEl, editor.value, {
    envStore: sharedEnvStore,
    namespaces: sharedNamespaces,
    onChange(markdown) {
      editor.value = markdown;
      persistDraft();
      setStatus("Document updated");
      try {
        renderPreview();
      } catch (err) {
        showPreviewError(err);
      }
    },
    onStatus(msg) {
      setStatus(msg);
    },
  });
}

function renderNow() {
  let previewOk = false;
  try {
    renderPreview();
    previewOk = true;
  } catch (err) {
    showPreviewError(err);
  }
  try {
    refreshGraphEditor();
  } catch (err) {
    if (graphEditorEl) {
      graphEditorEl.innerHTML = `<div class="im-errors">${escapeHtml(err.message || String(err))}</div>`;
    }
    setStatus("Render error");
    console.error(err);
  }
  if (previewOk) setStatus(dirty ? "Edited · preview updated" : "Preview updated");
}

function showEditorTab(name) {
  const source = name !== "graph";
  if (editor) editor.hidden = !source;
  if (graphEditorEl) graphEditorEl.hidden = source;
  tabSource?.setAttribute("aria-selected", source ? "true" : "false");
  tabGraph?.setAttribute("aria-selected", source ? "false" : "true");
}

function scheduleRender() {
  dirty = true;
  try {
    localStorage.setItem(STORAGE_KEY, editor.value);
  } catch (_) {
    /* ignore quota */
  }
  clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(renderNow, 180);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadMd(filename, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "document.md";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** @type {string} Currently selected example filename, or "". */
let currentExample = "";

function syncExampleSelect(name) {
  currentExample = name || "";
  if (!exampleSelect) return;
  const wanted = currentExample;
  const has = wanted && [...exampleSelect.options].some((o) => o.value === wanted);
  exampleSelect.value = has ? wanted : "";
}

async function loadExample(name) {
  if (!name) return;
  try {
    const res = await fetch(`examples/${name}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    editor.value = text;
    dirty = false;
    try {
      localStorage.setItem(STORAGE_KEY, text);
    } catch (_) {}
    syncExampleSelect(name);
    renderNow();
    setStatus(`Loaded examples/${name}`);
  } catch (err) {
    setStatus(`Failed to load example: ${err.message}`);
  }
}

const DEFAULT_DOC = `# Interactive Markdown

Edit the source, or open the Graph editor tab. The preview on the right updates as you go.

Use an \`\`\`ivm\`\`\` fence for sliders, timers, and live SVG.

\`\`\`ivm
@slider amp: 5..60 = 30 step=1 "Amplitude"
@timer t: 0..100 = 0 speed=20 loop "Phase"
@let y = 40 - amp * sin(t * pi / 50)
@svg
<svg viewBox="0 0 200 80" width="100%" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="200" height="80" fill="#0f172a"/>
  <path d="M 10 40 Q 55 {{round(y,2)}} 100 40 T 190 40"
        fill="none" stroke="#38bdf8" stroke-width="3"/>
  <circle cx="100" cy="{{round(y,2)}}" r="4" fill="#f472b6"/>
</svg>
\`\`\`

**Quick dialect**

- \`@slider name: min..max = default step=S "Label"\`
- \`@timer name: min..max = default speed=N loop\`
- \`@let name = expression\` (or \`@calc\`)
- \`@svg\` then SVG with \`{{expr}}\` placeholders
- \`@graph\` with \`@node\` and \`@edge\` for a visual graph editor

Open a \`.md\` file, or save your draft from the toolbar.
`;

function init() {
  if (!editor || !preview) {
    console.error("Missing #editor or #preview");
    return;
  }

  let start = DEFAULT_DOC;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) start = saved;
  } catch (_) {}

  editor.value = start;
  editor.addEventListener("input", scheduleRender);
  attachAutocomplete(editor, { onInsert: scheduleRender });
  tabSource?.addEventListener("click", () => showEditorTab("source"));
  tabGraph?.addEventListener("click", () => showEditorTab("graph"));
  showEditorTab("source");

  btnOpen?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const text = await file.text();
    editor.value = text;
    dirty = false;
    try {
      localStorage.setItem(STORAGE_KEY, text);
    } catch (_) {}
    syncExampleSelect("");
    renderNow();
    setStatus(`Opened ${file.name}`);
    fileInput.value = "";
  });

  btnSave?.addEventListener("click", () => {
    downloadMd("document.md", editor.value);
    dirty = false;
    setStatus("Downloaded document.md");
  });

  btnClear?.addEventListener("click", () => {
    if (!confirm("Reset editor to the built-in sample and clear the stored draft?")) return;
    editor.value = DEFAULT_DOC;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    dirty = false;
    syncExampleSelect("");
    renderNow();
    setStatus("Reset to default sample");
  });

  exampleSelect?.addEventListener("change", () => {
    const v = exampleSelect.value;
    if (v) loadExample(v);
    else syncExampleSelect("");
  });

  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      downloadMd("document.md", editor.value);
      setStatus("Downloaded document.md");
    }
  });

  renderNow();
}

init();
