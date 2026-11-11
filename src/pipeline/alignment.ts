// Alignement : caractères -> mots, transcription -> mots du script, caractères -> visèmes (lip-sync).
import type { CharAlignment, TimedWord, Viseme, VisemeSeg } from "../types.js";

export const normTok = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ]+/g, "");

/** Mots (séparés par des espaces) avec temps, à partir d'un alignement caractère par caractère. */
export function wordsFromChars(a: CharAlignment): TimedWord[] {
  const out: TimedWord[] = [];
  let cur = "", s = -1, e = -1;
  const flush = () => {
    if (cur.trim()) out.push({ text: cur.trim(), start: s, end: e });
    cur = ""; s = -1;
  };
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) return flush();
    if (s < 0) s = a.starts[i];
    cur += ch;
    e = a.ends[i];
  });
  flush();
  return out;
}

function similar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length > 3 && b.length > 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  // distance d'édition relative
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n] / Math.max(m, n) <= 0.34;
}

/**
 * Donne un temps à chaque mot du SCRIPT à partir d'une liste de mots horodatés (transcription,
 * TTS…) qui peut différer légèrement (nombres écrits autrement, mots oubliés…).
 * Alignement global type Needleman-Wunsch puis interpolation des mots non appariés.
 */
export function alignScriptWords(scriptText: string, timed: TimedWord[], totalDuration: number): TimedWord[] {
  const words = scriptText.split(/\s+/).filter(Boolean);
  const A = words.map(normTok);
  const B = timed.map((w) => normTok(w.text));
  const m = A.length, n = B.length;
  const cost = Array.from({ length: m + 1 }, () => new Float64Array(n + 1));
  const back = Array.from({ length: m + 1 }, () => new Uint8Array(n + 1));
  for (let i = 1; i <= m; i++) { cost[i][0] = i; back[i][0] = 1; }
  for (let j = 1; j <= n; j++) { cost[0][j] = j; back[0][j] = 2; }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const sub = cost[i - 1][j - 1] + (similar(A[i - 1], B[j - 1]) ? 0 : 1.2);
      const del = cost[i - 1][j] + 1;
      const ins = cost[i][j - 1] + 1;
      if (sub <= del && sub <= ins) { cost[i][j] = sub; back[i][j] = 0; }
      else if (del <= ins) { cost[i][j] = del; back[i][j] = 1; }
      else { cost[i][j] = ins; back[i][j] = 2; }
    }
  }
  const match: (TimedWord | null)[] = Array(m).fill(null);
  // groupes de mots transcrits rattachés à un mot du script (ex. "160" -> "ciento sesenta")
  let i = m, j = n;
  const extra: Map<number, TimedWord[]> = new Map();
  while (i > 0 || j > 0) {
    const b = back[i][j];
    if (i > 0 && j > 0 && b === 0) {
      match[i - 1] = timed[j - 1];
      i--; j--;
    } else if (i > 0 && (j === 0 || b === 1)) {
      i--;
    } else {
      if (i > 0) {
        const arr = extra.get(i - 1) ?? [];
        arr.push(timed[j - 1]);
        extra.set(i - 1, arr);
      }
      j--;
    }
  }
  const out: TimedWord[] = words.map((w, k) => {
    const mt = match[k];
    const ex = extra.get(k);
    if (mt) {
      let s = mt.start, e = mt.end;
      if (ex) for (const x of ex) { s = Math.min(s, x.start); e = Math.max(e, x.end); }
      return { text: w, start: s, end: e };
    }
    if (ex && ex.length) return { text: w, start: Math.min(...ex.map((x) => x.start)), end: Math.max(...ex.map((x) => x.end)) };
    return { text: w, start: NaN, end: NaN };
  });
  // interpolation des trous, proportionnelle au nombre de lettres
  let k = 0;
  while (k < out.length) {
    if (!Number.isNaN(out[k].start)) { k++; continue; }
    let e = k;
    while (e < out.length && Number.isNaN(out[e].start)) e++;
    const t0 = k > 0 ? out[k - 1].end : 0;
    const t1 = e < out.length ? out[e].start : totalDuration;
    const lens = out.slice(k, e).map((w) => w.text.length + 1);
    const tot = lens.reduce((x, y) => x + y, 0);
    let t = t0;
    for (let q = k; q < e; q++) {
      const d = ((t1 - t0) * lens[q - k]) / tot;
      out[q].start = t; out[q].end = t + d * 0.92; t += d;
    }
    k = e;
  }
  // monotonie
  for (let q = 1; q < out.length; q++) {
    if (out[q].start < out[q - 1].start) out[q].start = out[q - 1].start;
    if (out[q].end < out[q].start) out[q].end = out[q].start + 0.05;
  }
  return out;
}

/** Alignement caractère « synthétique » quand on n'a que les temps des mots. */
export function charsFromWords(words: TimedWord[]): CharAlignment {
  const characters: string[] = [], starts: number[] = [], ends: number[] = [];
  words.forEach((w, wi) => {
    const letters = [...w.text];
    const weights = letters.map((c) => (/[aeiouáéíóúü]/i.test(c) ? 1.6 : /[a-zñ]/i.test(c) ? 1 : 0.15));
    const tot = weights.reduce((a, b) => a + b, 0) || 1;
    let t = w.start;
    letters.forEach((c, i) => {
      const d = ((w.end - w.start) * weights[i]) / tot;
      characters.push(c); starts.push(t); ends.push(t + d); t += d;
    });
    if (wi < words.length - 1) {
      characters.push(" "); starts.push(w.end); ends.push(Math.max(w.end, words[wi + 1].start));
    }
  });
  return { characters, starts, ends };
}

const VOWEL: Record<string, Viseme> = { a: "A", á: "A", e: "E", é: "E", i: "I", í: "I", o: "O", ó: "O", u: "U", ú: "U", ü: "U" };

/** Lettre espagnole -> visème. */
function visemeOf(text: string[], i: number): Viseme | null {
  const c = text[i].toLowerCase();
  const next = (text[i + 1] || "").toLowerCase();
  const prev = (text[i - 1] || "").toLowerCase();
  if (VOWEL[c]) {
    if (c === "u" && (prev === "q" || (prev === "g" && /[eéií]/.test(next)))) return null; // "que", "gui" : u muet
    return VOWEL[c];
  }
  if (c === "y") return /[aeiouáéíóú]/.test(next) ? "I" : "I";
  if ("mbpv".includes(c)) return "M";
  if (c === "f") return "F";
  if (c === "h") return prev === "c" ? "C" : null; // h muet (sauf "ch")
  if (/[a-zñçß]/.test(c)) return "C";
  if (/[0-9]/.test(c)) return "C";
  return null; // espace, ponctuation
}

/** Segments de visèmes à partir de l'alignement caractère par caractère. */
export function visemesFromChars(a: CharAlignment): VisemeSeg[] {
  const segs: VisemeSeg[] = [];
  const ch = a.characters;
  for (let i = 0; i < ch.length; i++) {
    const v = visemeOf(ch, i);
    const s = a.starts[i], e = Math.max(a.ends[i], s + 0.02);
    if (!v) {
      // pause : bouche au repos si le silence dure
      if (/[\s.,;:!?¡¿…]/.test(ch[i]) && e - s > 0.12) segs.push({ v: "X", start: s, end: e });
      continue;
    }
    const last = segs[segs.length - 1];
    if (last && last.v === v && Math.abs(last.end - s) < 0.03) last.end = e;
    else segs.push({ v, start: s, end: e });
  }
  return segs;
}
