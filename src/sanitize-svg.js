/**
 * Sanitize SVG markup before injecting into the DOM.
 * Strips script, foreignObject, event handlers, and external hrefs.
 * Keeps shapes, SMIL animation, filters, internal <use>, and CSS in <style>
 * (keyframes, dash motion) after a CSS pass that drops imports and remote urls.
 */

/** Tags removed entirely (case-insensitive localName). */
const FORBIDDEN_TAGS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "handler", // legacy
]);

const MOTION_TAGS = new Set(["animate", "set", "animatetransform", "animatemotion"]);

/**
 * Optional allowlist. If an element is not forbidden and not in this set,
 * it is still kept (unknown SVG elements are generally harmless once scripts/hrefs are gone).
 * Listed for documentation / future strict mode.
 */
export const SAFE_SVG_TAGS = Object.freeze([
  "svg",
  "g",
  "defs",
  "symbol",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "path",
  "text",
  "tspan",
  "textpath",
  "title",
  "desc",
  "animate",
  "animatetransform",
  "animatemotion",
  "mpath",
  "set",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "pattern",
  "marker",
  "filter",
  "fegaussianblur",
  "femerge",
  "femergenode",
  "feoffset",
  "feflood",
  "fecomposite",
  "feblend",
  "fecolormatrix",
  "fedropshadow",
  "fecomponenttransfer",
  "fefuncr",
  "fefuncg",
  "fefuncb",
  "fefunca",
  "femorphology",
  "feturbulence",
  "fedisplacementmap",
  "feimage",
  "fetile",
  "fediffuselighting",
  "fespecularlighting",
  "fedistantlight",
  "fepointlight",
  "fespotlight",
  "image", // only with safe href (data:image or #)
  "switch",
  "a", // href must be safe (# only in practice)
  "style", // sanitized CSS only; renderer scopes it to the figure
  "use", // fragment hrefs only
]);

/**
 * @param {string} href
 * @returns {boolean}
 */
export function isSafeHref(href) {
  if (href == null || href === "") return true;
  const v = String(href).trim().toLowerCase();
  if (v.startsWith("#")) return true;
  if (v.startsWith("data:image/") && !v.startsWith("data:image/svg")) return true;
  // Block javascript:, http(s):, file:, svg data urls, and any other scheme or relative URL
  return false;
}

/**
 * Drop CSS that can load remote resources or break out of a style element.
 * Keeps @keyframes, animation, and url(#fragment) / raster data images.
 * @param {string} css
 * @returns {string}
 */
export function sanitizeCss(css) {
  let s = String(css ?? "");
  for (let pass = 0; pass < 2; pass++) {
    s = stripCssComments(s);
    s = decodeCssEscapes(s);
  }
  s = stripCssComments(s);
  s = s.replace(/<!--/g, "").replace(/-->/g, "");
  // Prevent </style> breakout when the markup is later parsed as HTML.
  s = s.replace(/</g, "");
  s = stripAtBlocks(s, ["font-face", "document"]);
  s = s.replace(/@import\b[^;{]*;?/gi, "");
  s = s.replace(/@(charset|namespace)\b[^;{]*;?/gi, "");
  s = s.replace(/expression\s*\(/gi, "(");
  s = s.replace(/javascript\s*:/gi, "");
  s = s.replace(/-moz-binding\s*:[^;}]*/gi, "");
  s = s.replace(/behavior\s*:[^;}]*/gi, "");
  s = s.replace(/position\s*:\s*fixed/gi, "position:static");
  s = replaceUnsafeUrls(s);
  return s.trim();
}

function stripCssComments(css) {
  return String(css).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\*[\s\S]*$/g, "");
}

/** Decode CSS hex and single-character escapes so obfuscated url()/javascript: cannot slip through. */
function decodeCssEscapes(input) {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    if (input[i] !== "\\") {
      out += input[i];
      continue;
    }
    const hex = /^[0-9a-fA-F]{1,6}/.exec(input.slice(i + 1));
    if (hex) {
      const cp = parseInt(hex[0], 16);
      i += hex[0].length;
      const next = input[i + 1];
      if (next === " " || next === "\n" || next === "\r" || next === "\t" || next === "\f") i += 1;
      if (cp > 0 && cp <= 0x10ffff) out += String.fromCodePoint(cp);
      continue;
    }
    if (i + 1 < input.length) {
      out += input[i + 1];
      i += 1;
    }
  }
  return out;
}

/**
 * @param {string} css
 * @param {string[]} names at-rule names without @
 */
function stripAtBlocks(css, names) {
  const re = new RegExp(`@(${names.join("|")})\\b`, "gi");
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(css))) {
    out += css.slice(last, m.index);
    let i = re.lastIndex;
    while (i < css.length && css[i] !== "{" && css[i] !== ";") i++;
    if (css[i] === ";") {
      i++;
    } else if (css[i] === "{") {
      let depth = 0;
      for (; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
      }
    }
    last = i;
    re.lastIndex = i;
  }
  out += css.slice(last);
  return out;
}

/**
 * @param {string} body
 * @returns {boolean}
 */
function isSafeCssUrl(body) {
  let v = String(body || "").trim();
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    v = v.slice(1, -1).trim();
  }
  if (!v) return false;
  const low = v.toLowerCase();
  if (v.startsWith("#")) return !/[\s"'()]/.test(v);
  if (low.startsWith("data:image/") && !low.startsWith("data:image/svg")) return true;
  return false;
}

function replaceUnsafeUrls(css) {
  let out = "";
  let i = 0;
  const lower = css.toLowerCase();
  while (i < css.length) {
    const idx = lower.indexOf("url(", i);
    if (idx === -1) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, idx);
    let j = idx + 4;
    let depth = 1;
    while (j < css.length && depth > 0) {
      const ch = css[j];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (depth > 0) j++;
      else break;
    }
    if (depth !== 0) break;
    const body = css.slice(idx + 4, j);
    out += isSafeCssUrl(body) ? `url(${body.trim()})` : "none";
    i = j + 1;
  }
  return out;
}

function getDOMParser() {
  const P = globalThis.DOMParser;
  if (!P) throw new Error("DOMParser is not available");
  return new P();
}

function serializeElement(el) {
  const S = globalThis.XMLSerializer;
  if (S) return new S().serializeToString(el);
  // linkedom / some environments: Element#toString or outerHTML
  if (typeof el.toString === "function") {
    const s = el.toString();
    if (s && s.startsWith("<")) return s;
  }
  if (typeof el.outerHTML === "string" && el.outerHTML) return el.outerHTML;
  throw new Error("XMLSerializer is not available");
}

/**
 * @param {Element} el
 * @param {string} name lowercase attribute name
 */
function removeAttr(el, name) {
  if (el.hasAttribute(name)) el.removeAttribute(name);
  // xlink:href variants
  if (name === "href" || name === "xlink:href") {
    try {
      el.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
    } catch (_) {
      /* ignore */
    }
    if (el.hasAttribute("xlink:href")) el.removeAttribute("xlink:href");
  }
}

function hrefOf(el) {
  return (
    el.getAttribute("href") ||
    el.getAttribute("xlink:href") ||
    ""
  );
}

/**
 * SMIL can animate href or event-handler attributes. Drop those animations.
 * @param {Element} el
 * @param {string} tag
 * @returns {boolean} true if the element was removed
 */
function dropDangerousAnimation(el, tag) {
  if (!MOTION_TAGS.has(tag)) return false;
  const attrName = String(el.getAttribute("attributeName") || "")
    .trim()
    .toLowerCase()
    .replace(/^.*:/, "");
  if (
    attrName.startsWith("on") ||
    attrName === "href" ||
    attrName === "style"
  ) {
    el.parentNode?.removeChild(el);
    return true;
  }
  for (const key of ["from", "to", "by", "values"]) {
    if (!el.hasAttribute(key)) continue;
    const raw = el.getAttribute(key) ?? "";
    if (!/url\s*\(|javascript\s*:|expression\s*\(/i.test(raw)) continue;
    const next = sanitizeCss(raw);
    if (!next) el.removeAttribute(key);
    else el.setAttribute(key, next);
  }
  return false;
}

/**
 * Sanitize an SVG string. Returns safe SVG markup (wraps fragments in <svg>).
 * @param {string} svgText
 * @returns {string}
 */
export function sanitizeSvg(svgText) {
  const raw = String(svgText || "").trim();
  if (!raw) return "";

  const parser = getDOMParser();
  const wrapped = /<svg\b/i.test(raw)
    ? raw
    : `<svg xmlns="http://www.w3.org/2000/svg">${raw}</svg>`;

  const doc = parser.parseFromString(wrapped, "image/svg+xml");

  // Some parsers surface errors as <parsererror>
  const parseError =
    doc.querySelector?.("parsererror") ||
    doc.getElementsByTagName?.("parsererror")?.[0];
  if (parseError) {
    console.warn("[sanitize-svg] parse error");
    return "";
  }

  const root = doc.documentElement;
  if (!root || String(root.localName || root.tagName || "").toLowerCase() !== "svg") {
    return "";
  }

  walk(root);

  if (!root.getAttribute("xmlns")) {
    root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  return serializeElement(root);
}

/**
 * @param {Element} el
 */
function walk(el) {
  const tag = String(el.localName || el.tagName || "").toLowerCase().replace(/^.*:/, "");

  if (FORBIDDEN_TAGS.has(tag)) {
    el.parentNode?.removeChild(el);
    return;
  }

  // <use href="sprite.svg#id"> can pull in external documents. Fragments stay.
  if (tag === "use") {
    const href = String(hrefOf(el)).trim();
    if (!href.startsWith("#") || !isSafeHref(href)) {
      el.parentNode?.removeChild(el);
      return;
    }
  }

  if (dropDangerousAnimation(el, tag)) return;

  const attrs = Array.from(el.attributes || []);
  for (const attr of attrs) {
    const name = String(attr.name || "").toLowerCase();
    const value = attr.value;

    // on* event handlers
    if (name.startsWith("on")) {
      removeAttr(el, attr.name);
      continue;
    }

    // href / xlink:href
    if (
      name === "href" ||
      name === "xlink:href" ||
      name.endsWith(":href") ||
      (attr.namespaceURI === "http://www.w3.org/1999/xlink" &&
        String(attr.localName || "").toLowerCase() === "href")
    ) {
      if (!isSafeHref(value)) {
        removeAttr(el, attr.name);
      }
      continue;
    }

    // Presentation values and style="" — keep url(#id), drop remote loads.
    if (name === "style" || /url\s*\(/i.test(value)) {
      const next = sanitizeCss(value);
      if (!next) removeAttr(el, attr.name);
      else if (next !== value) el.setAttribute(attr.name, next);
    }
  }

  if (tag === "style") {
    const kids = Array.from(el.children || []).filter((n) => n.nodeType === 1);
    for (const child of kids) child.parentNode?.removeChild(child);
    const css = sanitizeCss(el.textContent || "");
    if (!css) {
      el.parentNode?.removeChild(el);
      return;
    }
    el.textContent = css;
    return;
  }

  const children = Array.from(el.children || el.childNodes || []).filter(
    (n) => n.nodeType === 1
  );
  for (const child of children) {
    walk(/** @type {Element} */ (child));
  }
}
