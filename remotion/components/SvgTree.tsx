// Rend l'arbre SVG généré par Claude, en le "dessinant" élément par élément (effet craie) + animations data-anim.
import React from "react";
import type { SvgNode } from "../../src/types";
import { backOut, clamp01, easeOut } from "../lib";

const CAMEL: Record<string, string> = {
  "stroke-width": "strokeWidth", "stroke-linecap": "strokeLinecap", "stroke-linejoin": "strokeLinejoin",
  "stroke-dasharray": "strokeDasharray", "fill-opacity": "fillOpacity", "stroke-opacity": "strokeOpacity",
  "font-size": "fontSize", "font-weight": "fontWeight", "text-anchor": "textAnchor", "dominant-baseline": "dominantBaseline",
  "stop-color": "stopColor", "stop-opacity": "stopOpacity", "fill-rule": "fillRule", "letter-spacing": "letterSpacing",
  gradientUnits: "gradientUnits", viewBox: "viewBox",
};
const DRAWABLE = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "text"]);
const STROKABLE = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon"]);

function props(attrs: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "data-anim") continue;
    out[CAMEL[k] || k] = v;
  }
  return out;
}

function countDrawables(n: SvgNode): number {
  if (n.tag === "defs") return 0;
  return (DRAWABLE.has(n.tag) ? 1 : 0) + n.children.reduce((a, c) => a + (c.tag === "text" ? 1 : countDrawables(c)), 0);
}

function animStyle(anim: string | undefined, t: number, i: number): React.CSSProperties | undefined {
  if (!anim) return undefined;
  const base: React.CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };
  switch (anim) {
    case "pulse": return { ...base, transform: `scale(${1 + 0.07 * Math.sin(t * 2 * Math.PI * 1.3 + i)})` };
    case "spin": return { ...base, transform: `rotate(${t * 90}deg)` };
    case "float": return { ...base, transform: `translateY(${Math.sin(t * 2.2 + i) * 10}px)` };
    case "shake": return { ...base, transform: `translateX(${Math.sin(t * 38 + i) * 3.5}px)` };
    case "rise": {
      const ph = (t * 0.7 + i * 0.3) % 1;
      return { ...base, transform: `translateY(${-ph * 40}px)`, opacity: 0.4 + 0.6 * Math.sin(ph * Math.PI) };
    }
    case "grow": return { ...base, transform: `scale(${1 + 0.1 * Math.sin(t * 2.5 + i)})` };
    default: return undefined;
  }
}

export const SvgTree: React.FC<{ tree: SvgNode; t: number; duration: number }> = ({ tree, t, duration }) => {
  const total = Math.max(1, countDrawables(tree));
  // tout est dessiné pendant la première moitié de la scène (max 2 s)
  const drawSpan = Math.min(2.0, Math.max(0.8, duration * 0.5));
  const step = Math.min(0.28, drawSpan / total);
  const each = Math.max(0.3, step * 2.2);
  let order = 0;

  const render = (n: SvgNode, key: string, inheritedAnim?: string): React.ReactNode => {
    const P = props(n.attrs);
    const anim = n.attrs["data-anim"] || inheritedAnim;
    if (n.tag === "defs" || n.tag === "linearGradient" || n.tag === "radialGradient" || n.tag === "stop") {
      return React.createElement(n.tag, { key, ...P }, n.children.map((c, i) => render(c, `${key}.${i}`)));
    }
    if (n.tag === "svg" || n.tag === "g") {
      const own = n.attrs["data-anim"];
      const kids = n.children.map((c, i) => render(c, `${key}.${i}`));
      const el = React.createElement(n.tag === "svg" ? "g" : "g", { key: n.tag === "svg" ? undefined : `${key}i`, ...(n.tag === "svg" ? {} : P) }, kids);
      return own ? <g key={key} style={animStyle(own, t, order)}>{el}</g> : React.cloneElement(el, { key });
    }
    if (!DRAWABLE.has(n.tag) && n.tag !== "tspan") return null;
    const k = order++;
    const start = 0.25 + k * step;
    const p = clamp01((t - start) / each);
    if (p <= 0) return null;

    const hasStroke = STROKABLE.has(n.tag) && P.stroke && P.stroke !== "none";
    const style: React.CSSProperties = {};
    const extra: Record<string, unknown> = {};
    if (n.tag === "text") {
      const s = backOut(p);
      return (
        <g key={key} style={{ transformBox: "fill-box", transformOrigin: "center", transform: `scale(${s})`, opacity: clamp01(p * 2) }}>
          <text {...P} fontFamily="Fredoka, Nunito, sans-serif">
            {n.text}
            {n.children.map((c, i) => (c.tag === "tspan" ? <tspan key={i} {...props(c.attrs)}>{c.text}</tspan> : null))}
          </text>
        </g>
      );
    }
    if (hasStroke) {
      const drawn = easeOut(p);
      if (anim === "flow" && p >= 1) {
        extra.strokeDasharray = "22 16";
        extra.strokeDashoffset = -t * 70;
      } else {
        extra.pathLength = 1;
        extra.strokeDasharray = 1;
        extra.strokeDashoffset = 1 - drawn;
      }
      // le remplissage arrive après le trait
      const fo = Number(P.fillOpacity ?? (P.fill && P.fill !== "none" ? 1 : 0));
      if (P.fill && P.fill !== "none") style.fillOpacity = fo * clamp01((p - 0.45) / 0.55);
    } else {
      style.opacity = clamp01(p * 1.6) * Number(P.opacity ?? 1);
      style.transformBox = "fill-box";
      style.transformOrigin = "center";
      style.transform = `scale(${0.6 + 0.4 * backOut(p)})`;
    }
    const el = React.createElement(n.tag, { ...P, ...extra, style });
    const a = n.attrs["data-anim"] && n.attrs["data-anim"] !== "flow" ? animStyle(n.attrs["data-anim"], t, k) : undefined;
    return <g key={key} style={a}>{el}</g>;
  };

  return (
    <svg viewBox={tree.attrs.viewBox || "0 0 800 480"} width="100%" height="100%" style={{ overflow: "visible" }}>
      {render(tree, "r")}
    </svg>
  );
};
