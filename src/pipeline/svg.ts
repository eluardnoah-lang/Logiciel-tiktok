// SVG générés par Claude : nettoyage (liste blanche) + conversion en arbre JSON animable par Remotion.
import { XMLParser } from "fast-xml-parser";
import type { SvgNode } from "../types.js";

const TAGS = new Set([
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon",
  "text", "tspan", "defs", "linearGradient", "radialGradient", "stop",
]);
const ATTRS = new Set([
  "viewBox", "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "dx", "dy",
  "width", "height", "points", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "opacity", "fill-opacity", "stroke-opacity", "transform", "font-size", "font-weight",
  "text-anchor", "dominant-baseline", "id", "offset", "stop-color", "stop-opacity", "data-anim",
  "gradientUnits", "fx", "fy", "fill-rule", "letter-spacing",
]);
const ANIMS = new Set(["pulse", "spin", "float", "flow", "shake", "rise", "grow"]);

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
});

type Raw = Record<string, unknown>;

function cleanAttr(k: string, v: string): string | null {
  if (!ATTRS.has(k)) return null;
  const s = String(v);
  if (/javascript:|expression\(|<|>/i.test(s)) return null;
  if (/url\(/i.test(s) && !/^url\(#[\w-]+\)$/.test(s.trim())) return null;
  if (k === "data-anim" && !ANIMS.has(s)) return null;
  return s.slice(0, 4000);
}

function convert(node: Raw): SvgNode | null {
  const tag = Object.keys(node).find((k) => k !== ":@");
  if (!tag || !TAGS.has(tag)) return null;
  const attrsRaw = (node[":@"] as Record<string, string>) || {};
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrsRaw)) {
    const c = cleanAttr(k, v);
    if (c !== null) attrs[k] = c;
  }
  const kids = (node[tag] as Raw[]) || [];
  const children: SvgNode[] = [];
  let text = "";
  for (const k of kids) {
    if ("#text" in k) text += String(k["#text"]);
    else {
      const c = convert(k);
      if (c) children.push(c);
    }
  }
  const out: SvgNode = { tag, attrs, children };
  if (text && (tag === "text" || tag === "tspan")) out.text = text.slice(0, 60);
  return out;
}

export function parseSvg(svg: string): SvgNode | null {
  if (!svg || !svg.includes("<svg")) return null;
  try {
    const start = svg.indexOf("<svg");
    const end = svg.lastIndexOf("</svg>");
    const body = end > start ? svg.slice(start, end + 6) : svg.slice(start);
    const tree = parser.parse(body) as Raw[];
    const root = tree.find((n) => "svg" in n);
    if (!root) return null;
    const node = convert(root);
    if (!node) return null;
    if (!node.attrs.viewBox) node.attrs.viewBox = "0 0 800 480";
    delete node.attrs.width;
    delete node.attrs.height;
    return node;
  } catch {
    return null;
  }
}

function serialize(n: SvgNode): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const a = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
  const inner = (n.text ? esc(n.text) : "") + n.children.map(serialize).join("");
  return `<${n.tag}${n.tag === "svg" ? ' xmlns="http://www.w3.org/2000/svg"' : ""}${a}>${inner}</${n.tag}>`;
}

/** Renvoie un SVG propre (ou "" si invalide). */
export function sanitizeSvg(svg: string): string {
  const t = parseSvg(svg);
  return t ? serialize(t) : "";
}
