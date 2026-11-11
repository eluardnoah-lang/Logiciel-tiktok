// Contrôle qualité automatique d'une vidéo générée :
//   npm run check -- <id-de-la-video | dossier contenant video.mp4 + props.json>
// Vérifie : format (1080x1920, 30 fps, H.264/AAC), durée >= 60 s, aucune image figée > 3 s,
// calage du lip-sync (corrélation bouche / énergie de la voix) et des sous-titres (mots dans les zones parlées).
import fs from "node:fs";
import path from "node:path";
import { JOBS_DIR } from "./config.js";
import { probeVideo, silences } from "./pipeline/audio.js";
import type { VideoProps } from "./types.js";
import { mouthAt } from "../remotion/lib.js";
import { execFile } from "node:child_process";

function ffmpegStderr(args: string[]): Promise<string> {
  return new Promise((resolve) => execFile("ffmpeg", args, { maxBuffer: 256 * 1024 * 1024 }, (_e, _o, err) => resolve(String(err))));
}

async function audioEnvelope(file: string, fps: number): Promise<number[]> {
  // PCM mono 16 kHz -> RMS par image
  const { execFileSync } = await import("node:child_process");
  const raw = execFileSync("ffmpeg", ["-loglevel", "error", "-i", file, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], { maxBuffer: 512 * 1024 * 1024 });
  const pcm = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));
  const hop = Math.round(16000 / fps);
  const env: number[] = [];
  for (let i = 0; i + hop <= pcm.length; i += hop) {
    let s = 0;
    for (let k = i; k < i + hop; k++) s += (pcm[k] / 32768) ** 2;
    env.push(Math.sqrt(s / hop));
  }
  return env;
}

function corr(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  const ma = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
  const mb = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db || 1);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log("Usage : npm run check -- <id-video | dossier>");
    process.exit(1);
  }
  const dir = fs.existsSync(arg) ? path.resolve(arg) : path.join(JOBS_DIR, arg);
  const video = path.join(dir, "video.mp4");
  const props: VideoProps = JSON.parse(fs.readFileSync(path.join(dir, "props.json"), "utf8"));
  const results: [string, boolean, string][] = [];

  // 1. format
  const info = await probeVideo(video);
  results.push(["Format 1080x1920", info.width === 1080 && info.height === 1920, `${info.width}x${info.height}`]);
  results.push(["30 fps", Math.abs(info.fps - 30) < 0.01, `${info.fps} fps`]);
  results.push(["Codecs H.264 + AAC", info.vcodec === "h264" && info.acodec === "aac", `${info.vcodec} + ${info.acodec}`]);
  results.push(["Durée ≥ 60 s", info.duration >= 60, `${info.duration.toFixed(2)} s`]);

  // 2. images figées (> 3 s)
  const fz = await ffmpegStderr(["-hide_banner", "-i", video, "-vf", "freezedetect=n=0.0008:d=3", "-map", "0:v", "-f", "null", "-"]);
  const freezes = [...fz.matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_duration: ([\d.]+)/g)].map((m) => `${(+m[1]).toFixed(1)} s (${(+m[2]).toFixed(1)} s)`);
  results.push(["Aucune image figée > 3 s", freezes.length === 0, freezes.length ? freezes.join(", ") : "aucune"]);

  // 3. plans : changement visuel au moins toutes les 3 s
  const maxShot = Math.max(...props.shots.map((s) => s.end - s.start));
  results.push(["Changement de plan ≤ 3 s", maxShot <= 3.05, `plan le plus long : ${maxShot.toFixed(2)} s, ${props.shots.length} plans`]);

  // 4. lip-sync : corrélation entre l'ouverture de bouche animée et l'énergie de la voix, et décalage optimal
  const voiceFile = fs.existsSync(path.join(dir, "voice.mp3")) ? path.join(dir, "voice.mp3") : video;
  const env = await audioEnvelope(voiceFile, props.fps);
  const mouth = env.map((_, i) => mouthAt(props.visemes, i / props.fps).open);
  const byLag = new Map<number, number>();
  let best = { lag: 0, c: -1 };
  for (let lag = -10; lag <= 10; lag++) {
    const a = mouth.slice(Math.max(0, lag)), b = env.slice(Math.max(0, -lag));
    const c = corr(a, b);
    byLag.set(lag, c);
    if (c > best.c) best = { lag, c };
  }
  // le pic doit être net : nettement plus haut qu'avec un décalage de ±200 ms
  const far = Math.max(byLag.get(best.lag - 6) ?? -1, byLag.get(best.lag + 6) ?? -1);
  // et la bouche doit être fermée pendant les vrais silences (> 0,3 s)
  let run = 0, silentFrames = 0, openInSilence = 0;
  const thr = 0.01;
  for (let i = 0; i < env.length; i++) {
    run = env[i] < thr ? run + 1 : 0;
    if (run > 9) { silentFrames++; if (mouth[i - 4] > 0.15) openInSilence++; }
  }
  const closedRatio = silentFrames ? 1 - openInSilence / silentFrames : 1;
  results.push([
    "Lip-sync calé (décalage ≤ 2 images)",
    Math.abs(best.lag) <= 2 && best.c - far > 0.12 && closedRatio > 0.9,
    `pic de corrélation ${best.c.toFixed(2)} à ${best.lag} image(s) (${Math.round((best.lag / props.fps) * 1000)} ms, avance volontaire ~30 ms) vs ${far.toFixed(2)} à ±200 ms ; bouche fermée ${Math.round(closedRatio * 100)} % des silences`,
  ]);

  // 5. sous-titres : chaque mot doit tomber dans une zone parlée
  const sil = await silences(voiceFile, -38, 0.25);
  const inSilence = props.words.filter((w) => sil.some(([a, b]) => (w.start + w.end) / 2 > a + 0.05 && (w.start + w.end) / 2 < b - 0.05));
  results.push(["Sous-titres synchronisés", inSilence.length <= Math.max(1, props.words.length * 0.02), `${props.words.length} mots, ${inSilence.length} en plein silence${inSilence.length ? " : " + inSilence.slice(0, 5).map((w) => w.text).join(", ") : ""}`]);

  // 6. couverture du tableau : chaque scène a une illustration
  const noSvg = props.scenes.filter((s) => !s.svgTree).length;
  results.push(["Illustration à chaque scène", noSvg === 0, `${props.scenes.length - noSvg}/${props.scenes.length}`]);

  let ok = true;
  for (const [name, pass, detail] of results) {
    ok &&= pass;
    console.log(`${pass ? "✅" : "❌"} ${name.padEnd(38)} ${detail}`);
  }
  console.log(ok ? "\nTout est bon." : "\nCertains contrôles ont échoué.");
  process.exit(ok ? 0 : 1);
}

main();
