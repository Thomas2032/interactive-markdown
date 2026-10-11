/**
 * Sanitize SVG markup before injecting into the DOM.
 * Strips script, foreignObject, event handlers, and external hrefs.
 * Safe shapes (rect, circle, line, path, text, g, defs, animate, …) are kept.
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
  "use", // may reference external resources
  "handler", // legacy
  "style", // avoid CSS injection vectors in v1; presentation attrs remain
]);

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
  "set",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "pattern",
  "marker",
  "image", // only with safe href (data:image or #)
  "switch",
  "a", // href must be safe (# only in practice)
]);

/**
 * @param {string} href
 * @returns {boolean}
 */
export function isSafeHref(href) {
  if (href == null || href === "") return true;
  const v = String(href).trim().toLowerCase();
  if (v.startsWith("#")) return true;
  if (v.startsWith("data:image/")) return true;
  // Block javascript:, http(s):, file:, and any other scheme or relative URL
  return false;
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

    // xlink:actuate etc. left alone; block style urls with external schemes
    if (name === "style" && /url\s*\(\s*['"]?\s*(https?:|javascript:|data:text)/i.test(value)) {
      removeAttr(el, attr.name);
      continue;
    }
  }

  const children = Array.from(el.children || el.childNodes || []).filter(
    (n) => n.nodeType === 1
  );
  for (const child of children) {
    walk(/** @type {Element} */ (child));
  }
}
