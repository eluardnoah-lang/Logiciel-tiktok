// Tests unitaires rapides (sans réseau) : npm test
import assert from "node:assert/strict";
import { alignScriptWords, charsFromWords, visemesFromChars, wordsFromChars } from "../src/pipeline/alignment.js";
import { parseSvg, sanitizeSvg } from "../src/pipeline/svg.js";
import { groupWords } from "../remotion/components/Subtitles.js";
import { mouthAt } from "../remotion/lib.js";
import type { CharAlignment } from "../src/types.js";

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n++;
  console.log("✅", name);
}

// Alignement façon ElevenLabs : un temps par caractère
function fakeEleven(text: string, cps = 14): CharAlignment {
  const characters = [...text];
  const starts = characters.map((_, i) => i / cps);
  return { characters, starts, ends: starts.map((s) => s + 1 / cps) };
}

test("mots à partir de l'alignement caractère par caractère", () => {
  const w = wordsFromChars(fakeEleven("¿Sabías que estornudamos?"));
  assert.deepEqual(w.map((x) => x.text), ["¿Sabías", "que", "estornudamos?"]);
  assert.ok(w[1].start > w[0].end - 1e-9);
});

test("alignement d'une transcription différente du script (MP3 importé)", () => {
  const script = "Estornudas a 160 km/h, ¡más rápido que un coche!";
  // ce que Scribe entend : nombres en toutes lettres, un mot oublié
  const heard = ["Estornudas", "a", "ciento", "sesenta", "kilómetros", "por", "hora,", "más", "rápido", "un", "coche!"].map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.3 }));
  const out = alignScriptWords(script, heard, 5);
  assert.equal(out.length, 9);
  assert.equal(out[0].start, 0);
  for (let i = 1; i < out.length; i++) assert.ok(out[i].start >= out[i - 1].start, "temps croissants");
  assert.ok(out[out.length - 1].end <= 5);
  assert.ok(Math.abs(out[out.length - 1].start - 10 * 0.4) < 0.01, "dernier mot calé sur « coche! »");
});

test("visèmes : bilabiales fermées, voyelles ouvertes, repos dans les pauses", () => {
  const al = fakeEleven("mamá. Uno");
  const v = visemesFromChars(al);
  assert.equal(v[0].v, "M");
  assert.equal(v[1].v, "A");
  const m = mouthAt(v, (v[0].start + v[0].end) / 2 - 0.03);
  assert.ok(m.open < 0.1, "bouche fermée sur le m");
  const a = mouthAt(v, (v[1].start + v[1].end) / 2 - 0.03);
  assert.ok(a.open > 0.7, "bouche ouverte sur le a");
  assert.ok(mouthAt(v, 50).open < 0.05, "repos après la fin");
});

test("caractères synthétiques depuis des mots", () => {
  const c = charsFromWords([{ text: "hola", start: 0, end: 0.4 }, { text: "tú", start: 0.6, end: 0.8 }]);
  assert.equal(c.characters.join(""), "hola tú");
  assert.ok(Math.abs(c.ends[3] - 0.4) < 1e-9);
});

test("sous-titres : 2 à 4 mots par groupe", () => {
  const words = "Tu cuerpo produce calor suficiente para hervir medio litro de agua en media hora.".split(" ").map((text, i) => ({ text, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const g = groupWords(words);
  assert.ok(g.every((x) => x.words.length >= 1 && x.words.length <= 4));
  assert.equal(g.flatMap((x) => x.words).length, words.length);
});

test("SVG : éléments dangereux supprimés", () => {
  const dirty = `<svg viewBox="0 0 800 480" onload="alert(1)"><script>alert(1)</script><image href="http://x"/><circle cx="1" cy="2" r="3" fill="url(http://evil)" stroke="#fff" data-anim="pulse"/><foreignObject><div/></foreignObject><text x="1" y="2">hola</text></svg>`;
  const clean = sanitizeSvg(dirty);
  assert.ok(!/script|onload|image|foreignObject|evil/.test(clean), clean);
  const t = parseSvg(clean)!;
  assert.equal(t.children[0].tag, "circle");
  assert.equal(t.children[0].attrs["data-anim"], "pulse");
  assert.equal(t.children[1].text, "hola");
});

test("SVG : guillemets simples et texte autour acceptés", () => {
  const t = parseSvg("Voici : <svg viewBox='0 0 800 480'><g data-anim='spin'><rect x='1' y='1' width='5' height='5'/></g></svg> fin");
  assert.ok(t);
  assert.equal(t!.children[0].attrs["data-anim"], "spin");
  assert.equal(parseSvg("pas de svg"), null);
});

console.log(`\n${n} tests réussis.`);
