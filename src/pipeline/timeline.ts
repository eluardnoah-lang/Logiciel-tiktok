// Construit la "partition" de la vidéo : temps de chaque scène, plans caméra, gestes, effets sonores.
import type { Settings } from "../config.js";
import type { Script, Shot, ShotKind, SfxCue, TimedScene, VideoProps } from "../types.js";
import { ASSET_FILES } from "./assets.js";
import { visemesFromChars } from "./alignment.js";
import { parseSvg } from "./svg.js";
import type { VoiceResult } from "./voice/index.js";

export const FPS = 30;
export const TAIL = 1.3; // secondes après la dernière phrase

const CYCLE: ShotKind[] = ["board", "wide", "push", "board", "pan", "prof", "board", "wide", "board", "push", "prof", "pan"];

export function buildTimeline(script: Script, voice: VoiceResult, settings: Settings, urls: { audio: string; asset: (f: string) => string }): VideoProps {
  const total = voice.duration + TAIL;
  const words = voice.words;

  // ---- scènes ----
  const scenes: TimedScene[] = [];
  let w = 0;
  script.scenes.forEach((sc, i) => {
    const n = sc.text.split(/\s+/).filter(Boolean).length;
    const first = words[Math.min(w, words.length - 1)];
    const start = i === 0 ? 0 : Math.max(0, first.start - 0.12);
    scenes.push({ ...sc, index: i, start, end: total, svgTree: parseSvg(sc.svg) });
    w += n;
  });
  for (let i = 0; i < scenes.length - 1; i++) scenes[i].end = scenes[i + 1].start;

  // ---- plans caméra : un changement toutes les 2-3 s ----
  const shots: Shot[] = [];
  let ci = 0;
  for (const sc of scenes) {
    const d = sc.end - sc.start;
    const parts = Math.max(1, Math.ceil(d / 2.8));
    for (let p = 0; p < parts; p++) {
      const s = sc.start + (d * p) / parts;
      const e = sc.start + (d * (p + 1)) / parts;
      // accroche : gros plan sur le prof ; au début des autres scènes le tableau doit être visible
      const next = (allowProf: boolean): ShotKind => {
        let kk: ShotKind;
        do kk = CYCLE[ci++ % CYCLE.length];
        while (!allowProf && kk === "prof");
        return kk;
      };
      let kind: ShotKind = sc.index === 0 && p === 0 ? "prof" : next(p > 0);
      if (shots.length && shots[shots.length - 1].kind === kind) kind = kind === "board" ? "wide" : "board";
      shots.push({ kind, start: s, end: e });
    }
  }

  // ---- gestes : début de scène + mots forts (chiffres, exclamations) ----
  const gestures: number[] = [];
  const pushG = (t: number) => {
    if (!gestures.length || t - gestures[gestures.length - 1] > 1.6) gestures.push(t);
  };
  let k = 0;
  for (const sc of scenes) {
    pushG(sc.start + 0.15);
    const n = sc.text.split(/\s+/).filter(Boolean).length;
    for (let q = k; q < k + n && q < words.length; q++) {
      if (/[0-9]|!|¡/.test(words[q].text) || /^(nunca|siempre|todo|enorme|increíble|millones?|mil)$/i.test(words[q].text)) pushG(words[q].start);
    }
    k += n;
  }
  gestures.sort((a, b) => a - b);

  // ---- effets sonores ----
  const sfx: SfxCue[] = [];
  if (settings.sfx) {
    scenes.forEach((sc) => {
      if (sc.index > 0) sfx.push({ src: urls.asset(ASSET_FILES.whoosh), at: Math.max(0, sc.start - 0.15), volume: 0.22 });
      sfx.push({ src: urls.asset(ASSET_FILES.pop), at: sc.start + 0.3, volume: 0.28 });
      if (sc.number) sfx.push({ src: urls.asset(ASSET_FILES.ding), at: sc.start + 0.55, volume: 0.16 });
    });
  }

  return {
    fps: FPS,
    durationInFrames: Math.ceil(total * FPS),
    audioSrc: urls.audio,
    musicSrc: settings.music ? urls.asset(ASSET_FILES.music) : null,
    musicVolume: settings.musicVolume,
    sfx,
    words,
    visemes: visemesFromChars(voice.chars),
    scenes,
    shots,
    gestures,
    title: script.title,
    seed: [...script.fact].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7),
  };
}
