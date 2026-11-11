// Outils audio (ffmpeg / ffprobe) : durée, conversion.
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { AppError } from "../errors.js";

const require = createRequire(import.meta.url);

function findBin(name: "ffmpeg" | "ffprobe"): { bin: string; env: NodeJS.ProcessEnv } {
  try {
    const p = execFileSync("which", [name], { encoding: "utf8" }).trim();
    if (p) return { bin: p, env: process.env };
  } catch {}
  // Repli : binaires fournis par Remotion
  for (const pkg of ["@remotion/compositor-linux-x64-gnu", "@remotion/compositor-linux-arm64-gnu", "@remotion/compositor-darwin-arm64", "@remotion/compositor-darwin-x64", "@remotion/compositor-win32-x64-msvc"]) {
    try {
      const dir = path.dirname(require.resolve(`${pkg}/package.json`));
      const bin = path.join(dir, process.platform === "win32" ? `${name}.exe` : name);
      if (fs.existsSync(bin)) {
        return { bin, env: { ...process.env, LD_LIBRARY_PATH: dir, DYLD_LIBRARY_PATH: dir } };
      }
    } catch {}
  }
  throw new AppError("no_ffmpeg", `${name} introuvable.`, "Installez ffmpeg (ex. apt install ffmpeg ou brew install ffmpeg).");
}

function run(name: "ffmpeg" | "ffprobe", args: string[]): Promise<string> {
  const { bin, env } = findBin(name);
  return new Promise((resolve, reject) => {
    execFile(bin, args, { env, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new AppError("ffmpeg_failed", `${name} a échoué : ${String(stderr).split("\n").slice(-3).join(" ")}`));
      else resolve(String(stdout));
    });
  });
}

export async function audioDuration(file: string): Promise<number> {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  const d = parseFloat(out.trim());
  if (!Number.isFinite(d) || d <= 0) throw new AppError("bad_audio", "Fichier audio illisible ou vide.", "Vérifiez que c'est bien un MP3/WAV valide.");
  return d;
}

/** Convertit n'importe quel audio en MP3 44,1 kHz (format stable pour le rendu). */
export async function toMp3(input: string, output: string): Promise<void> {
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-ac", "1", "-ar", "44100", "-b:a", "160k", output]);
}

/** Normalise le volume de la voix (loudness ~ -16 LUFS, standard réseaux sociaux). */
export async function normalizeVoice(input: string, output: string): Promise<void> {
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-b:a", "160k", output]);
}

export async function probeVideo(file: string): Promise<{ width: number; height: number; fps: number; duration: number; vcodec: string; acodec: string }> {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate:format=duration", "-of", "json", file]);
  const j = JSON.parse(out);
  const v = j.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  const a = j.streams.find((s: { codec_type: string }) => s.codec_type === "audio");
  const [num, den] = String(v?.r_frame_rate || "0/1").split("/").map(Number);
  return { width: v?.width, height: v?.height, fps: num / (den || 1), duration: parseFloat(j.format.duration), vcodec: v?.codec_name, acodec: a?.codec_name };
}

export { run as runFfmpegTool };

/** Intervalles de silence [début, fin] détectés par ffmpeg. */
export function silences(file: string, noiseDb = -35, minDur = 0.18): Promise<[number, number][]> {
  const { bin, env } = findBin("ffmpeg");
  return new Promise((resolve) => {
    execFile(bin, ["-hide_banner", "-i", file, "-af", `silencedetect=noise=${noiseDb}dB:d=${minDur}`, "-f", "null", "-"], { env, maxBuffer: 64 * 1024 * 1024 }, (_e, _o, stderr) => {
      const out: [number, number][] = [];
      let s: number | null = null;
      for (const line of String(stderr).split("\n")) {
        const a = line.match(/silence_start: ([\d.]+)/);
        const b = line.match(/silence_end: ([\d.]+)/);
        if (a) s = parseFloat(a[1]);
        if (b && s !== null) { out.push([s, parseFloat(b[1])]); s = null; }
      }
      resolve(out);
    });
  });
}
