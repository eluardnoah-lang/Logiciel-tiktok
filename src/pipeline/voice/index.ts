// ÉTAPE 2 — VOIX : choisit la source (ElevenLabs, MP3 importé, voix de test) et produit audio + alignement.
import fs from "node:fs";
import path from "node:path";
import { env, type Settings } from "../../config.js";
import { AppError } from "../../errors.js";
import type { CharAlignment, Script, TimedWord } from "../../types.js";
import { alignScriptWords, charsFromWords, wordsFromChars } from "../alignment.js";
import { audioDuration, normalizeVoice, silences, toMp3 } from "../audio.js";
import { narrationOf } from "../script.js";
import { elevenTranscribe, elevenTts } from "./elevenlabs.js";
import { localTts } from "./local.js";

export type VoiceMode = "elevenlabs" | "upload" | "local";

export interface VoiceResult {
  /** Nom du fichier audio dans le dossier du job. */
  audioFile: string;
  duration: number;
  /** Un élément par mot du script, avec ses temps. */
  words: TimedWord[];
  /** Alignement caractère par caractère (réel pour ElevenLabs, estimé sinon). */
  chars: CharAlignment;
  source: VoiceMode;
  alignmentMethod: string;
}

/**
 * Repli sans transcription : chaque fin de phrase / virgule est calée sur un silence réel,
 * puis les mots sont répartis dans les zones parlées selon leur longueur.
 */
async function proportionalWords(file: string, text: string, duration: number): Promise<TimedWord[]> {
  const sil = (await silences(file, -35, 0.12)).filter(([a, b]) => b - a >= 0.12);
  const lead = sil.length && sil[0][0] < 0.05 ? sil.shift()![1] : 0;
  const tail = sil.length && sil[sil.length - 1][1] > duration - 0.05 ? sil.pop()![0] : duration;
  const words = text.split(/\s+/).filter(Boolean);
  const weight = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, "").length + 1.5;
  // groupes de mots séparés par la ponctuation
  const groups: number[][] = [[]];
  words.forEach((w, i) => {
    groups[groups.length - 1].push(i);
    if (/[.,;:!?…]$/.test(w) && i < words.length - 1) groups.push([]);
  });
  const gw = groups.map((g) => g.reduce((x, i) => x + weight(words[i]), 0));
  const pauseTot = sil.reduce((x, [a, b]) => x + (b - a), 0);
  const rate = (tail - lead - pauseTot) / gw.reduce((x, y) => x + y, 0);
  // calage glouton des frontières sur les silences les plus proches de la position attendue
  const bounds: [number, number][] = [];
  let t = lead, used = -1;
  for (let g = 0; g < groups.length - 1; g++) {
    const expected = t + gw[g] * rate;
    let best = -1, bestD = Infinity;
    for (let k = used + 1; k < sil.length; k++) {
      const d = Math.abs(sil[k][0] - expected);
      if (d < bestD && sil[k][0] > t + 0.15) { bestD = d; best = k; }
      if (sil[k][0] > expected + 2) break;
    }
    if (best >= 0 && bestD < Math.max(1.2, gw[g] * rate * 0.6)) {
      bounds.push([sil[best][0], sil[best][1]]);
      used = best;
      t = sil[best][1];
    } else {
      bounds.push([expected, expected]);
      t = expected;
    }
  }
  const out: TimedWord[] = [];
  let start = lead;
  groups.forEach((g, gi) => {
    const end = gi < bounds.length ? bounds[gi][0] : tail;
    const tot = g.reduce((x, i) => x + weight(words[i]), 0);
    let c = start;
    for (const i of g) {
      const d = ((end - start) * weight(words[i])) / tot;
      out.push({ text: words[i], start: c, end: c + d * 0.95 });
      c += d;
    }
    start = gi < bounds.length ? bounds[gi][1] : tail;
  });
  return out;
}

export async function makeVoice(jobDir: string, script: Script, s: Settings, mode: VoiceMode, uploadPath?: string): Promise<VoiceResult> {
  const text = narrationOf(script.scenes);
  const out = path.join(jobDir, "voice.mp3");

  if (mode === "elevenlabs") {
    const tts = await elevenTts(text, s);
    const raw = path.join(jobDir, "voice_raw.mp3");
    fs.writeFileSync(raw, tts.audio);
    await normalizeVoice(raw, out);
    const duration = await audioDuration(out);
    const words = alignScriptWords(text, wordsFromChars(tts.alignment), duration);
    return { audioFile: "voice.mp3", duration, words, chars: tts.alignment, source: mode, alignmentMethod: "ElevenLabs (caractère par caractère)" };
  }

  if (mode === "local") {
    const wav = path.join(jobDir, "voice_local.wav");
    const r = await localTts(text, wav);
    await normalizeVoice(wav, out);
    const duration = await audioDuration(out);
    const words = alignScriptWords(text, r.words, duration);
    return { audioFile: "voice.mp3", duration, words, chars: charsFromWords(words), source: mode, alignmentMethod: "espeak-ng (mot par mot)" };
  }

  // MP3 importé
  if (!uploadPath || !fs.existsSync(uploadPath)) throw new AppError("no_upload", "Aucun fichier audio importé.", "Choisissez un fichier MP3.");
  await normalizeVoice(uploadPath, out).catch(() => toMp3(uploadPath, out));
  const duration = await audioDuration(out);
  let words: TimedWord[];
  let method: string;
  if (env.elevenKey) {
    const heard = await elevenTranscribe(out, s);
    words = alignScriptWords(text, heard, duration);
    method = "Transcription ElevenLabs Scribe (mot par mot)";
  } else {
    words = await proportionalWords(out, text, duration);
    method = "Estimation (silences + longueur des mots) — ajoutez ELEVENLABS_API_KEY pour un alignement précis";
  }
  return { audioFile: "voice.mp3", duration, words, chars: charsFromWords(words), source: mode, alignmentMethod: method };
}
