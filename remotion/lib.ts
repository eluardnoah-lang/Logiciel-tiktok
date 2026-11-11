import type { Shot, Viseme, VisemeSeg } from "../src/types";

export const W = 1080;
export const H = 1920;

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
/** Rebond (léger dépassement) pour les "pop". */
export const backOut = (x: number, s = 1.9) => {
  const t = clamp01(x) - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
};

/** Bruit 1D doux et déterministe (somme de sinus). */
export const wobble = (t: number, seed: number) =>
  Math.sin(t * 1.13 + seed) * 0.5 + Math.sin(t * 2.31 + seed * 1.7) * 0.3 + Math.sin(t * 0.47 + seed * 3.1) * 0.2;

export function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---------------- Lip-sync ----------------
export interface Mouth {
  open: number; // 0 fermée .. 1 grande ouverte
  wide: number; // 0 étroite .. 1 étirée
  round: number; // 0 .. 1 lèvres arrondies
}
const SHAPES: Record<Viseme, Mouth> = {
  A: { open: 0.95, wide: 0.6, round: 0.05 },
  E: { open: 0.55, wide: 0.85, round: 0 },
  I: { open: 0.32, wide: 0.95, round: 0 },
  O: { open: 0.7, wide: 0.25, round: 0.85 },
  U: { open: 0.35, wide: 0.1, round: 1 },
  M: { open: 0, wide: 0.5, round: 0.1 },
  F: { open: 0.12, wide: 0.65, round: 0 },
  C: { open: 0.3, wide: 0.6, round: 0.05 },
  X: { open: 0.02, wide: 0.5, round: 0 },
};
const REST: Mouth = SHAPES.X;

/** Index du dernier segment qui commence avant t (recherche dichotomique). */
function findSeg(segs: VisemeSeg[], t: number) {
  let lo = 0, hi = segs.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

const mix = (a: Mouth, b: Mouth, k: number): Mouth => ({
  open: a.open + (b.open - a.open) * k,
  wide: a.wide + (b.wide - a.wide) * k,
  round: a.round + (b.round - a.round) * k,
});

/**
 * Forme de bouche à l'instant t : visème en cours, avec un court fondu (coarticulation)
 * vers le visème précédent / suivant, et retour au repos dans les pauses.
 * La bouche anticipe le son d'environ 30 ms (comme dans la réalité).
 */
export function mouthAt(segs: VisemeSeg[], t0: number): Mouth {
  if (!segs.length) return REST;
  const t = t0 + 0.03;
  const XF = 0.045; // durée du fondu entre deux visèmes
  const i = findSeg(segs, t);
  const shapeOf = (k: number) => (k < 0 || k >= segs.length ? REST : SHAPES[segs[k].v]);
  if (i < 0) {
    // avant la première syllabe
    const d = segs[0].start - t;
    return d < XF ? mix(REST, shapeOf(0), 1 - d / XF) : REST;
  }
  const s = segs[i];
  if (t > s.end) {
    // trou entre deux segments (pause) : on se ferme, puis on anticipe le suivant
    const next = segs[i + 1];
    const gap = (next ? next.start : Infinity) - s.end;
    const fromPrev = clamp01((t - s.end) / Math.min(0.08, gap / 2 + 0.001));
    let m = mix(shapeOf(i), REST, fromPrev);
    if (next && next.start - t < XF) m = mix(m, shapeOf(i + 1), 1 - (next.start - t) / XF);
    return m;
  }
  let m = shapeOf(i);
  const len = s.end - s.start;
  const xf = Math.min(XF, len / 2);
  // fondu d'entrée depuis le segment précédent (s'il est contigu)
  const prev = segs[i - 1];
  if (prev && s.start - prev.end < 0.03 && t - s.start < xf) m = mix(shapeOf(i - 1), m, 0.5 + 0.5 * ((t - s.start) / xf));
  // fondu de sortie vers le suivant
  const next = segs[i + 1];
  if (next && next.start - s.end < 0.03 && s.end - t < xf) m = mix(m, shapeOf(i + 1), 0.5 * (1 - (s.end - t) / xf));
  return m;
}

/** Énergie de parole lissée (0..1) : sert aux mouvements de tête et aux gestes. */
export function speechEnergy(segs: VisemeSeg[], t: number): number {
  let e = 0;
  for (let k = -4; k <= 4; k++) e += mouthAt(segs, t + k * 0.06).open * (1 - Math.abs(k) / 5);
  return clamp01(e / 3.2);
}

// ---------------- Caméra ----------------
export interface Cam {
  x: number; // point de la scène placé au centre de l'écran
  y: number;
  zoom: number;
}

export function shotCam(shot: Shot, p: number, seed: number): Cam {
  // p : progression 0..1 dans le plan -> lent travelling / zoom (effet Ken Burns)
  const drift = (a: number) => Math.sin(seed * 3.7 + a) * 12;
  switch (shot.kind) {
    case "board":
      return { x: 545 + drift(1), y: 640 + p * 10, zoom: 1.13 + p * 0.04 };
    case "prof":
      return { x: 300 + p * 20, y: 1190 - p * 15, zoom: 1.55 + p * 0.06 };
    case "push":
      return { x: 540, y: 960 - p * 70, zoom: 1.0 + p * 0.12 };
    case "pan":
      return { x: 470 + p * 140, y: 900, zoom: 1.12 };
    case "wide":
    default:
      return { x: 540 + drift(2) * 0.5, y: 960 - p * 20, zoom: 1.0 + p * 0.03 };
  }
}

export function cameraAt(shots: Shot[], t: number, seed: number): { cam: Cam; shotIndex: number; sinceCut: number } {
  let i = shots.findIndex((s) => t >= s.start && t < s.end);
  if (i < 0) i = t < (shots[0]?.start ?? 0) ? 0 : shots.length - 1;
  const s = shots[i];
  if (!s) return { cam: { x: 540, y: 960, zoom: 1 }, shotIndex: 0, sinceCut: t };
  const p = clamp01((t - s.start) / Math.max(0.1, s.end - s.start));
  const target = shotCam(s, p, seed + i);
  const since = t - s.start;
  // Transitions : un plan sur deux en mouvement rapide (0,3 s), les autres en coupe sèche avec un petit "punch".
  if (i > 0 && i % 2 === 1 && since < 0.3) {
    const prev = shotCam(shots[i - 1], 1, seed + i - 1);
    const k = easeInOut(since / 0.3);
    return { cam: { x: lerp(prev.x, target.x, k), y: lerp(prev.y, target.y, k), zoom: lerp(prev.zoom, target.zoom, k) }, shotIndex: i, sinceCut: since };
  }
  if (i > 0 && since < 0.25) {
    const punch = 1 + 0.035 * (1 - easeOut(since / 0.25));
    return { cam: { ...target, zoom: target.zoom * punch }, shotIndex: i, sinceCut: since };
  }
  return { cam: target, shotIndex: i, sinceCut: since };
}

/** Transform CSS d'un calque selon la caméra et sa profondeur (parallaxe). */
export function layerTransform(cam: Cam, depth: number): string {
  const z = 1 + (cam.zoom - 1) * depth;
  const fx = 540 + (cam.x - 540) * depth;
  const fy = 960 + (cam.y - 960) * depth;
  return `translate(${W / 2}px, ${H / 2}px) scale(${z}) translate(${-fx}px, ${-fy}px)`;
}

/** Enveloppe d'un geste : montée 0,3 s, tenue, descente. */
export function gestureEnvelope(gestures: number[], t: number, hold = 0.9): { v: number; index: number } {
  let best = 0, idx = -1;
  for (let k = 0; k < gestures.length; k++) {
    const d = t - gestures[k];
    if (d < -0.05 || d > hold + 0.8) continue;
    const up = easeInOut(d / 0.3);
    const down = 1 - easeInOut((d - hold) / 0.6);
    const v = Math.min(up, down);
    if (v > best) { best = v; idx = k; }
  }
  return { v: best, index: idx };
}
