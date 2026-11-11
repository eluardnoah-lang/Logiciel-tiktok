// Orchestration des étapes (script -> voix -> rendu), état persistant sur disque (data/jobs/<id>/job.json).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ASSETS_DIR, JOBS_DIR, MIN_DURATION, env, loadSettings, type Settings } from "./config.js";
import { AppError, toUserError } from "./errors.js";
import type { Script, Verification } from "./types.js";
import { ensureAssets } from "./pipeline/assets.js";
import { audioDuration, probeVideo } from "./pipeline/audio.js";
import { ensureBackdrops, renderFrame, renderVideo, serveDirs } from "./pipeline/render.js";
import { extendScript, generateScript, narrationOf, normalizeEditedScript, wordCount } from "./pipeline/script.js";
import { buildTimeline } from "./pipeline/timeline.js";
import { makeVoice, type VoiceMode, type VoiceResult } from "./pipeline/voice/index.js";

export type JobStatus = "scripting" | "script_ready" | "voicing" | "rendering" | "done" | "error";
export type Step = "script" | "voice" | "render";

export interface Job {
  id: string;
  createdAt: string;
  updatedAt: string;
  fact: string;
  title: string;
  status: JobStatus;
  step: Step;
  progress: Record<Step, number>;
  message: string;
  warnings: string[];
  error?: { code: string; message: string; hint?: string; step: Step };
  voiceMode?: VoiceMode;
  verification?: Verification;
  duration?: number;
  words?: number;
  files: { video?: string; caption?: string; thumb?: string; audio?: string };
  pid?: number;
}

function alive(pid?: number) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const dirOf = (id: string) => path.join(JOBS_DIR, id);
const jobFile = (id: string) => path.join(dirOf(id), "job.json");

function save(job: Job) {
  job.updatedAt = new Date().toISOString();
  job.pid = process.pid; // processus qui travaille sur ce job
  const tmp = jobFile(job.id) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2));
  fs.renameSync(tmp, jobFile(job.id));
}

export function getJob(id: string): Job | null {
  if (!/^[\w-]+$/.test(id)) return null;
  for (let i = 0; i < 3; i++) {
    try {
      return JSON.parse(fs.readFileSync(jobFile(id), "utf8"));
    } catch {
      // fichier en cours de remplacement : on réessaie
    }
  }
  return null;
}

export function listJobs(): Job[] {
  return fs
    .readdirSync(JOBS_DIR)
    .map((id) => getJob(id))
    .filter((j): j is Job => !!j)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteJob(id: string) {
  const j = getJob(id);
  if (!j) return;
  if (j.status === "rendering" || j.status === "voicing" || j.status === "scripting") throw new AppError("busy", "Impossible de supprimer une vidéo en cours de création.");
  fs.rmSync(dirOf(id), { recursive: true, force: true });
}

export function getScript(id: string): Script | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dirOf(id), "script.json"), "utf8"));
  } catch {
    return null;
  }
}

function saveScript(id: string, s: Script) {
  fs.writeFileSync(path.join(dirOf(id), "script.json"), JSON.stringify(s, null, 2));
}

export function jobPath(id: string, file: string): string | null {
  const p = path.join(dirOf(id), path.basename(file));
  return fs.existsSync(p) ? p : null;
}

function newJob(fact: string): Job {
  const now = new Date();
  const id = `${now.toISOString().slice(0, 10)}-${crypto.randomBytes(3).toString("hex")}`;
  fs.mkdirSync(dirOf(id), { recursive: true });
  const job: Job = {
    id, createdAt: now.toISOString(), updatedAt: now.toISOString(), fact, title: fact.slice(0, 60),
    status: "scripting", step: "script", progress: { script: 0, voice: 0, render: 0 }, message: "En attente…", warnings: [], files: {},
  };
  save(job);
  return job;
}

function fail(job: Job, step: Step, e: unknown) {
  const u = toUserError(e);
  console.error(`[job ${job.id}] ${step} :`, e);
  job.status = "error";
  job.error = { ...u, step };
  job.message = u.message;
  save(job);
}

// File d'attente : un seul rendu lourd à la fois.
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

// ---------------- Étape 1 : script ----------------
export function startScript(fact: string): Job {
  const clean = fact.trim().replace(/\s+/g, " ");
  if (clean.length < 8) throw new AppError("fact_too_short", "Le fait insolite est trop court.", "Exemple : « on éternue à 160 km/h ».");
  if (!env.anthropicKey) throw new AppError("missing_key", "La clé ANTHROPIC_API_KEY est manquante.", "Ajoutez-la dans le fichier .env puis redémarrez (voir README).");
  const job = newJob(clean);
  void runScript(job.id);
  return job;
}

async function runScript(id: string) {
  const job = getJob(id)!;
  const settings = loadSettings();
  try {
    job.status = "scripting"; job.step = "script"; job.progress.script = 0.05;
    save(job);
    let k = 0;
    const script = await generateScript(job.fact, settings.targetDuration, (m) => {
      job.message = m; job.progress.script = Math.min(0.95, 0.15 + 0.3 * k++); save(job);
    });
    saveScript(id, script);
    Object.assign(job, { status: "script_ready", title: script.title, verification: script.verification, words: wordCount(narrationOf(script.scenes)), message: "Script prêt : relisez-le puis lancez la voix." });
    job.progress.script = 1;
    save(job);
  } catch (e) {
    fail(job, "script", e);
  }
}

/** Crée un job directement à partir d'un script existant (sans Claude). */
export function createFromScript(script: Script): Job {
  const s = normalizeEditedScript(script);
  const job = newJob(s.fact || s.title);
  saveScript(job.id, s);
  Object.assign(job, { status: "script_ready", title: s.title, verification: s.verification, words: wordCount(narrationOf(s.scenes)), message: "Script prêt." });
  job.progress.script = 1;
  save(job);
  return job;
}

export function updateScript(id: string, script: Script): Job {
  const job = getJob(id);
  if (!job) throw new AppError("not_found", "Vidéo introuvable.");
  if (!["script_ready", "done", "error"].includes(job.status)) throw new AppError("busy", "La vidéo est en cours de création, modification impossible.");
  const prev = getScript(id);
  const s = normalizeEditedScript({ ...prev!, ...script, fact: prev?.fact ?? job.fact, verification: prev?.verification ?? script.verification });
  saveScript(id, s);
  Object.assign(job, { title: s.title, words: wordCount(narrationOf(s.scenes)) });
  save(job);
  return job;
}

// ---------------- Étapes 2 + 3 : voix puis rendu ----------------
export function startProduction(id: string, mode: VoiceMode, uploadPath?: string): Promise<Job> {
  const job = getJob(id);
  if (!job) throw new AppError("not_found", "Vidéo introuvable.");
  if (!getScript(id)) throw new AppError("no_script", "Il n'y a pas encore de script pour cette vidéo.");
  if (["voicing", "rendering", "scripting"].includes(job.status)) throw new AppError("busy", "Cette vidéo est déjà en cours de création.");
  if (mode === "elevenlabs" && !env.elevenKey) throw new AppError("missing_key", "La clé ELEVENLABS_API_KEY est manquante.", "Ajoutez-la dans .env, ou importez votre propre MP3.");
  if (mode === "upload" && uploadPath) {
    fs.copyFileSync(uploadPath, path.join(dirOf(id), "upload" + (path.extname(uploadPath) || ".mp3")));
  }
  Object.assign(job, { status: "voicing", step: "voice", voiceMode: mode, error: undefined, warnings: [], message: "En file d'attente…" });
  job.progress.voice = 0; job.progress.render = 0;
  save(job);
  return enqueue(() => runProduction(id, mode));
}

async function runProduction(id: string, mode: VoiceMode): Promise<Job> {
  const job = getJob(id)!;
  const settings = loadSettings();
  const dir = dirOf(id);
  let script = getScript(id)!;
  let voice: VoiceResult;
  // ----- voix -----
  try {
    const upload = fs.readdirSync(dir).find((f) => f.startsWith("upload."));
    for (let attempt = 0; ; attempt++) {
      job.message = mode === "upload" ? "Analyse de votre MP3 (transcription + alignement)…" : mode === "local" ? "Synthèse de la voix de test…" : "ElevenLabs génère la voix…";
      job.progress.voice = 0.15 + attempt * 0.2;
      save(job);
      voice = await makeVoice(dir, script, settings, mode, upload ? path.join(dir, upload) : undefined);
      if (voice.duration >= MIN_DURATION) break;
      const missing = MIN_DURATION - voice.duration;
      if (mode === "upload") {
        job.warnings.push(`Votre MP3 dure ${voice.duration.toFixed(1)} s (< 60 s) : la vidéo sera plus courte que le minimum.`);
        break;
      }
      if (!env.anthropicKey) {
        job.warnings.push(`Audio de ${voice.duration.toFixed(1)} s (< 60 s) et pas de clé Claude pour rallonger le script.`);
        break;
      }
      if (attempt >= 2) {
        job.warnings.push(`Audio encore trop court après 3 essais (${voice.duration.toFixed(1)} s).`);
        break;
      }
      script = await extendScript(script, missing, (m) => { job.message = m; save(job); });
      saveScript(id, script);
      job.words = wordCount(narrationOf(script.scenes));
    }
    fs.writeFileSync(path.join(dir, "alignment.json"), JSON.stringify({ method: voice!.alignmentMethod, words: voice!.words, chars: voice!.chars }, null, 1));
    job.duration = voice!.duration;
    job.files.audio = voice!.audioFile;
    job.progress.voice = 1;
    job.message = `Voix prête (${voice!.duration.toFixed(1)} s, ${voice!.alignmentMethod}).`;
    save(job);
  } catch (e) {
    fail(job, "voice", e);
    return getJob(id)!;
  }
  return runRender(id, script, voice!, settings);
}

async function runRender(id: string, script: Script, voice: VoiceResult, settings: Settings): Promise<Job> {
  const job = getJob(id)!;
  const dir = dirOf(id);
  ensureAssets();
  const srv = await serveDirs({ job: dir, assets: ASSETS_DIR });
  try {
    job.status = "rendering"; job.step = "render"; job.progress.render = 0.01; job.message = "Préparation du rendu…";
    save(job);
    const asset = (f: string) => `${srv.url}/assets/${f}`;
    const props = buildTimeline(script, voice, settings, { audio: `${srv.url}/job/${voice.audioFile}`, asset });
    job.message = "Préparation du décor…";
    save(job);
    const bd = await ensureBackdrops();
    props.backdrops = { wall: asset(bd.wall), bench: asset(bd.bench), board: asset(bd.board) };
    fs.writeFileSync(path.join(dir, "props.json"), JSON.stringify(props));
    const out = path.join(dir, "video.mp4");
    let last = 0;
    await renderVideo({
      props,
      output: out,
      onProgress: (p) => {
        if (p - last > 0.01 || p === 1) {
          last = p; job.progress.render = p; job.message = `Rendu vidéo : ${Math.round(p * 100)} %`; save(job);
        }
      },
    });
    // miniature (image au milieu de la 2e scène)
    try {
      const sc = props.scenes[1] ?? props.scenes[0];
      await renderFrame(props, Math.round(((sc.start + sc.end) / 2) * props.fps), path.join(dir, "thumb.jpg"));
      job.files.thumb = "thumb.jpg";
    } catch (e) {
      console.warn("miniature impossible", e);
    }
    const info = await probeVideo(out);
    fs.writeFileSync(path.join(dir, "caption.txt"), `${script.caption}\n\n${script.hashtags.join(" ")}\n`);
    Object.assign(job, { status: "done", files: { ...job.files, video: "video.mp4", caption: "caption.txt" }, duration: info.duration, message: `Vidéo prête : ${info.duration.toFixed(1)} s, ${info.width}x${info.height}.` });
    job.progress.render = 1;
    save(job);
  } catch (e) {
    fail(job, "render", e);
  } finally {
    srv.close();
  }
  return getJob(id)!;
}

/** Relance uniquement le rendu (la voix existe déjà). */
export function retryRender(id: string): Promise<Job> {
  const job = getJob(id);
  if (!job) throw new AppError("not_found", "Vidéo introuvable.");
  const dir = dirOf(id);
  const al = path.join(dir, "alignment.json");
  if (!fs.existsSync(al) || !job.files.audio) throw new AppError("no_voice", "Pas encore de voix : relancez la création complète.");
  const a = JSON.parse(fs.readFileSync(al, "utf8"));
  job.status = "rendering"; job.error = undefined; save(job);
  return enqueue(async () => {
    const duration = await audioDuration(path.join(dir, job.files.audio!));
    const voice: VoiceResult = { audioFile: job.files.audio!, duration, words: a.words, chars: a.chars, source: job.voiceMode ?? "elevenlabs", alignmentMethod: a.method };
    return runRender(id, getScript(id)!, voice, loadSettings());
  });
}

/** Au démarrage : les jobs interrompus (serveur redémarré) passent en erreur relançable. */
export function recoverInterrupted() {
  for (const j of listJobs()) {
    if (["scripting", "voicing", "rendering"].includes(j.status) && (j.pid === process.pid || !alive(j.pid))) {
      j.status = "error";
      j.error = { code: "interrupted", message: "Le serveur a redémarré pendant la création.", hint: "Relancez l'étape depuis l'historique.", step: j.step };
      save(j);
    }
  }
}
