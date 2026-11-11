import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
export const JOBS_DIR = path.join(DATA_DIR, "jobs");
export const ASSETS_DIR = path.join(DATA_DIR, "assets");
export const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

fs.mkdirSync(JOBS_DIR, { recursive: true });
fs.mkdirSync(ASSETS_DIR, { recursive: true });

export const env = {
  port: Number(process.env.PORT || 3000),
  anthropicKey: process.env.ANTHROPIC_API_KEY?.trim() || "",
  elevenKey: process.env.ELEVENLABS_API_KEY?.trim() || "",
  claudeModel: process.env.CLAUDE_MODEL?.trim() || "claude-opus-5-5",
  password: process.env.APP_PASSWORD?.trim() || "",
  renderConcurrency: process.env.RENDER_CONCURRENCY ? Number(process.env.RENDER_CONCURRENCY) : null,
  gl: (process.env.REMOTION_GL?.trim() || "swangle") as "swangle" | "angle" | "egl" | "swiftshader" | "vulkan" | "angle-egl",
  browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE?.trim() || null,
};

export interface Settings {
  voiceId: string;
  voiceModel: string;
  sttModel: string;
  /** Durée visée en secondes (minimum absolu : 60 s). */
  targetDuration: number;
  music: boolean;
  musicVolume: number;
  sfx: boolean;
  voiceStability: number;
  voiceSimilarity: number;
  voiceStyle: number;
  voiceSpeed: number;
}

export const DEFAULT_SETTINGS: Settings = {
  // Voix multilingue de la bibliothèque ElevenLabs (à remplacer par une voix espagnole de votre choix).
  voiceId: "pNInz6obpgDQGcFmaJgB",
  voiceModel: "eleven_multilingual_v2",
  sttModel: "scribe_v1",
  targetDuration: 66,
  music: true,
  musicVolume: 0.08,
  sfx: true,
  voiceStability: 0.4,
  voiceSimilarity: 0.8,
  voiceStyle: 0.35,
  voiceSpeed: 1.0,
};

export const MIN_DURATION = 60;

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    return sanitizeSettings({ ...DEFAULT_SETTINGS, ...raw });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = sanitizeSettings({ ...loadSettings(), ...patch });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

function clamp(n: unknown, lo: number, hi: number, dflt: number) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : dflt;
}

function sanitizeSettings(s: Settings): Settings {
  const d = DEFAULT_SETTINGS;
  return {
    voiceId: String(s.voiceId || d.voiceId).trim(),
    voiceModel: String(s.voiceModel || d.voiceModel).trim(),
    sttModel: String(s.sttModel || d.sttModel).trim(),
    targetDuration: clamp(s.targetDuration, MIN_DURATION, 90, d.targetDuration),
    music: Boolean(s.music),
    musicVolume: clamp(s.musicVolume, 0, 0.4, d.musicVolume),
    sfx: s.sfx === undefined ? true : Boolean(s.sfx),
    voiceStability: clamp(s.voiceStability, 0, 1, d.voiceStability),
    voiceSimilarity: clamp(s.voiceSimilarity, 0, 1, d.voiceSimilarity),
    voiceStyle: clamp(s.voiceStyle, 0, 1, d.voiceStyle),
    voiceSpeed: clamp(s.voiceSpeed, 0.7, 1.2, d.voiceSpeed),
  };
}
