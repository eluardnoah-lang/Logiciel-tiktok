// Musique de fond et effets sonores générés procéduralement (aucun fichier externe, libres de droits).
import fs from "node:fs";
import path from "node:path";
import { ASSETS_DIR } from "../config.js";

const SR = 44100;

function writeWav(file: string, data: Float32Array, sr = SR) {
  const n = data.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
  const g = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i] * g)) * 32767), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

// petit générateur pseudo-aléatoire déterministe
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function music(): Float32Array {
  const bpm = 96, beat = 60 / bpm, bars = 16;
  const len = Math.round(bars * 4 * beat * SR);
  const out = new Float32Array(len);
  const rnd = rng(7);
  // Progression douce : Cmaj7 - Am7 - Fmaj7 - G6
  const chords = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]];
  const add = (t0: number, dur: number, f: number, amp: number, kind: "pad" | "pluck" | "bass") => {
    const i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
    for (let k = 0; k < n; k++) {
      const i = (i0 + k) % len; // boucle parfaite
      const t = k / SR;
      let env: number, v: number;
      if (kind === "pad") {
        env = Math.min(1, t / 0.4) * Math.min(1, (dur - t) / 0.6);
        v = Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 2.003 * t) + 0.1 * Math.sin(2 * Math.PI * f * 3 * t);
      } else if (kind === "pluck") {
        env = Math.exp(-t * 6) * Math.min(1, t / 0.005);
        v = Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 20);
      } else {
        env = Math.exp(-t * 2.5) * Math.min(1, t / 0.01);
        v = Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(2 * Math.PI * f * 2 * t);
      }
      out[i] += v * env * amp;
    }
  };
  for (let bar = 0; bar < bars; bar++) {
    const ch = chords[bar % 4];
    const tb = bar * 4 * beat;
    for (const m of ch) add(tb, 4 * beat, midi(m + 12), 0.05, "pad");
    add(tb, 2 * beat, midi(ch[0] - 12), 0.22, "bass");
    add(tb + 2.5 * beat, 1.5 * beat, midi(ch[0] - 12), 0.16, "bass");
    // arpège joyeux
    const arp = [ch[0] + 24, ch[2] + 12, ch[1] + 24, ch[3] + 12, ch[2] + 24, ch[1] + 24, ch[3] + 12, ch[0] + 24];
    arp.forEach((m, k) => { if (!(bar % 2 === 1 && k % 4 === 3)) add(tb + k * 0.5 * beat, 0.6, midi(m), 0.06, "pluck"); });
    // batterie très légère : kick + shaker
    for (let b = 0; b < 4; b++) {
      const tk = tb + b * beat;
      if (b % 2 === 0) {
        const i0 = Math.floor(tk * SR);
        for (let k = 0; k < SR * 0.18; k++) {
          const t = k / SR;
          out[(i0 + k) % len] += 0.35 * Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-t * 30)) * t) * Math.exp(-t * 18);
        }
      }
      for (const off of [0, 0.5]) {
        const i0 = Math.floor((tk + off * beat) * SR);
        let lp = 0;
        for (let k = 0; k < SR * 0.05; k++) {
          const t = k / SR;
          const nz = rnd();
          lp = lp * 0.3 + nz * 0.7;
          out[(i0 + k) % len] += (nz - lp) * 0.05 * (off ? 0.6 : 1) * Math.exp(-t * 70);
        }
      }
    }
  }
  return out;
}

function whoosh(): Float32Array {
  const n = Math.floor(0.45 * SR), out = new Float32Array(n), rnd = rng(3);
  let lp = 0, lp2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const cut = 0.02 + 0.25 * Math.sin(Math.PI * t); // balayage du filtre
    lp += cut * (rnd() - lp);
    lp2 += cut * (lp - lp2);
    out[i] = lp2 * Math.sin(Math.PI * t) ** 1.5 * 3;
  }
  return out;
}

function pop(): Float32Array {
  const n = Math.floor(0.14 * SR), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (300 + 900 * Math.exp(-t * 40))) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * 30) * Math.min(1, t / 0.002);
  }
  return out;
}

function ding(): Float32Array {
  const n = Math.floor(0.7 * SR), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = (Math.sin(2 * Math.PI * 1318.5 * t) + 0.5 * Math.sin(2 * Math.PI * 1975.5 * t) + 0.25 * Math.sin(2 * Math.PI * 2637 * t)) * Math.exp(-t * 6) * Math.min(1, t / 0.003);
  }
  return out;
}

function bubble(): Float32Array {
  const n = Math.floor(0.25 * SR), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (500 + 1400 * t * 4)) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * 18) * Math.min(1, t / 0.004);
  }
  return out;
}

export const ASSET_FILES = { music: "music.wav", whoosh: "whoosh.wav", pop: "pop.wav", ding: "ding.wav", bubble: "bubble.wav" };

/** Crée les fichiers audio s'ils n'existent pas encore. */
export function ensureAssets(): string {
  const gen: Record<string, () => Float32Array> = { music, whoosh, pop, ding, bubble };
  for (const [k, f] of Object.entries(ASSET_FILES)) {
    const p = path.join(ASSETS_DIR, f);
    if (!fs.existsSync(p)) writeWav(p, gen[k]());
  }
  return ASSETS_DIR;
}
