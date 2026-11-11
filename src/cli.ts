// Ligne de commande : génère une vidéo sans passer par l'interface web.
//   npm run cli -- --fact "On éternue à 160 km/h"               (Claude + ElevenLabs)
//   npm run cli -- --fact "..." --voice local                    (voix de test hors-ligne)
//   npm run cli -- --script examples/calor/script.json --voice local --out data/example
//   npm run cli -- --script mon_script.json --audio ma_voix.mp3
import fs from "node:fs";
import path from "node:path";
import { toUserError } from "./errors.js";
import { createFromScript, getJob, getScript, jobPath, startProduction, startScript } from "./jobs.js";
import type { VoiceMode } from "./pipeline/voice/index.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function waitScript(id: string) {
  let last = "";
  for (;;) {
    const j = getJob(id);
    if (!j) {
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }
    if (j.message !== last) console.log("•", (last = j.message));
    if (j.status === "script_ready") return j;
    if (j.status === "error") throw Object.assign(new Error(j.error?.message), { hint: j.error?.hint });
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function main() {
  const fact = arg("fact");
  const scriptFile = arg("script");
  const audio = arg("audio");
  const voice = (arg("voice") as VoiceMode | undefined) ?? (audio ? "upload" : "elevenlabs");
  const out = arg("out");
  if (!fact && !scriptFile) {
    console.log("Usage : npm run cli -- --fact \"…\" [--voice elevenlabs|local] [--audio voix.mp3] [--out dossier]");
    process.exit(1);
  }
  let job = scriptFile ? createFromScript(JSON.parse(fs.readFileSync(scriptFile, "utf8"))) : startScript(fact!);
  console.log("Vidéo", job.id);
  if (!scriptFile) job = await waitScript(job.id);
  const s = getScript(job.id)!;
  console.log(`Script : ${s.scenes.length} scènes, verdict « ${s.verification.verdict} »`);
  const timer = setInterval(() => {
    const j = getJob(job.id);
    if (j) process.stdout.write(`\r• [${j.step}] ${j.message}                    `);
  }, 2000);
  job = await startProduction(job.id, voice, audio ? path.resolve(audio) : undefined);
  clearInterval(timer);
  console.log();
  if (job.status !== "done") {
    console.error("ÉCHEC :", job.error?.message, job.error?.hint ? `\n→ ${job.error.hint}` : "");
    process.exit(2);
  }
  for (const w of job.warnings) console.warn("⚠", w);
  console.log("✔", job.message);
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    for (const f of ["video.mp4", "caption.txt", "thumb.jpg", "props.json", "alignment.json", "script.json", "voice.mp3"]) {
      const p = jobPath(job.id, f);
      if (p) fs.copyFileSync(p, path.join(out, f));
    }
    console.log("Fichiers copiés dans", path.resolve(out));
  } else {
    console.log("Vidéo :", jobPath(job.id, "video.mp4"));
  }
  process.exit(0);
}

main().catch((e) => {
  const u = toUserError(e);
  console.error("ERREUR :", u.message, u.hint || (e as { hint?: string }).hint ? `\n→ ${u.hint || (e as { hint?: string }).hint}` : "");
  process.exit(1);
});
