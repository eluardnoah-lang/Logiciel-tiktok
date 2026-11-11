// Serveur web : API + interface mobile (public/).
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import { ROOT, env, loadSettings, saveSettings } from "./config.js";
import { AppError, toUserError } from "./errors.js";
import { createFromScript, deleteJob, getJob, getScript, jobPath, listJobs, recoverInterrupted, retryRender, startProduction, startScript, updateScript } from "./jobs.js";
import { ensureAssets } from "./pipeline/assets.js";
import { getBundle } from "./pipeline/render.js";
import { elevenVoices } from "./pipeline/voice/elevenlabs.js";
import type { VoiceMode } from "./pipeline/voice/index.js";

const app = express();
const upload = multer({ dest: path.join(os.tmpdir(), "tiktok-uploads"), limits: { fileSize: 60 * 1024 * 1024 } });

// Protection simple par mot de passe (si APP_PASSWORD est défini) — indispensable si le serveur est en ligne.
app.use((req, res, next) => {
  if (!env.password || req.path === "/healthz") return next();
  const h = req.headers.authorization || "";
  const [, b64] = h.split(" ");
  const pass = b64 ? Buffer.from(b64, "base64").toString().split(":").slice(1).join(":") : "";
  if (pass === env.password) return next();
  res.setHeader("WWW-Authenticate", 'Basic realm="Datos curiosos"');
  res.status(401).send("Mot de passe requis");
});

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(ROOT, "public")));

const wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res)).catch(next);
};
const param = (req: Request, k: string) => String(req.params[k]);

app.get("/healthz", (_req, res) => {
  res.send("ok");
});

app.get("/api/status", (_req, res) => {
  res.json({ keys: { anthropic: !!env.anthropicKey, elevenlabs: !!env.elevenKey }, model: env.claudeModel, settings: loadSettings() });
});

app.get("/api/settings", (_req, res) => {
  res.json(loadSettings());
});
app.put("/api/settings", (req, res) => {
  res.json(saveSettings(req.body || {}));
});

app.get("/api/voices", wrap(async (_req, res) => {
  res.json(await elevenVoices());
}));

app.get("/api/jobs", (_req, res) => {
  res.json(listJobs());
});

app.post("/api/jobs", (req, res) => {
  if (req.body?.script) {
    res.json(createFromScript(req.body.script));
    return;
  }
  res.json(startScript(String(req.body?.fact || "")));
});

app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(param(req, "id"));
  if (!job) throw new AppError("not_found", "Vidéo introuvable.");
  res.json({ job, script: getScript(job.id) });
});

app.put("/api/jobs/:id/script", (req, res) => {
  res.json(updateScript(param(req, "id"), req.body));
});

app.post("/api/jobs/:id/produce", upload.single("audio"), (req, res) => {
  const mode = (req.body?.mode || (req.file ? "upload" : "elevenlabs")) as VoiceMode;
  if (!["elevenlabs", "upload", "local"].includes(mode)) throw new AppError("bad_mode", "Mode de voix inconnu.");
  if (mode === "upload" && !req.file) throw new AppError("no_upload", "Aucun fichier audio reçu.", "Choisissez un MP3.");
  const id = param(req, "id");
  const p = startProduction(id, mode, req.file?.path);
  p.catch(() => {});
  res.json(getJob(id));
});

app.post("/api/jobs/:id/rerender", (req, res) => {
  const id = param(req, "id");
  retryRender(id).catch(() => {});
  res.json(getJob(id));
});

app.delete("/api/jobs/:id", (req, res) => {
  deleteJob(param(req, "id"));
  res.json({ ok: true });
});

app.get("/files/:id/:file", (req, res) => {
  const file = param(req, "file");
  if (!/^(video\.mp4|caption\.txt|thumb\.jpg|voice\.mp3|script\.json)$/.test(file)) throw new AppError("not_found", "Fichier introuvable.");
  const p = jobPath(param(req, "id"), file);
  if (!p) throw new AppError("not_found", "Fichier introuvable.");
  if (req.query.dl) {
    const job = getJob(param(req, "id"));
    const slug = (job?.title || "video").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "_").slice(0, 40);
    res.download(p, `${slug}_${file}`);
  } else res.sendFile(p);
});

// Gestion d'erreurs : toujours un JSON lisible par l'interface.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const u = toUserError(err);
  const status = u.code === "not_found" ? 404 : err instanceof AppError ? 400 : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: u });
});

recoverInterrupted();
ensureAssets();
app.listen(env.port, "0.0.0.0", () => {
  console.log(`\n  ✅ Générateur de vidéos prêt : http://localhost:${env.port}`);
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal);
  for (const i of ips) console.log(`     depuis l'iPad (même Wi-Fi) : http://${i!.address}:${env.port}`);
  if (!env.anthropicKey) console.log("  ⚠  ANTHROPIC_API_KEY manquante (voir .env.example)");
  if (!env.elevenKey) console.log("  ⚠  ELEVENLABS_API_KEY manquante (voir .env.example)");
  // pré-chauffe le bundle Remotion pour que le premier rendu démarre plus vite
  getBundle().then(() => console.log("  🎬 Moteur de rendu prêt"), (e) => console.error("  ❌", toUserError(e).message));
});
