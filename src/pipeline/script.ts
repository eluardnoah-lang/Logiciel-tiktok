// ÉTAPE 1 — SCRIPT : écriture, vérification scientifique, découpage en scènes + SVG, légende.
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config.js";
import { AppError, missingKey } from "../errors.js";
import type { Scene, Script, Verdict } from "../types.js";
import {
  SYSTEM_STORYBOARD,
  SYSTEM_VERIFIER,
  SYSTEM_WRITER,
  SYSTEM_SCENE_REVIEW,
  extendPrompt,
  reviewScenesPrompt,
  storyboardPrompt,
  verifyPrompt,
  writePrompt,
} from "./prompts.js";
import { sanitizeSvg } from "./svg.js";

type Json = Record<string, unknown>;
type Progress = (msg: string) => void;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!env.anthropicKey) throw missingKey("ANTHROPIC_API_KEY");
  if (!client) client = new Anthropic({ apiKey: env.anthropicKey, maxRetries: 3, timeout: 15 * 60 * 1000 });
  return client;
}

/** Appel Claude avec sortie JSON structurée (schéma garanti). */
async function askJson<T>(system: string, user: string, schema: Json, effort: "medium" | "high" = "high"): Promise<T> {
  const c = getClient();
  let msg;
  try {
    const stream = c.beta.messages.stream({
      model: env.claudeModel,
      max_tokens: 64000,
      // Si un filtre de sécurité refuse la requête, l'API relance automatiquement sur un modèle de secours.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: user }],
      output_config: { effort, format: { type: "json_schema", schema } },
    });
    msg = await stream.finalMessage();
  } catch (e) {
    throw claudeError(e);
  }
  if (msg.stop_reason === "refusal") {
    throw new AppError("claude_refusal", "Claude a refusé de traiter ce sujet.", "Reformulez le fait insolite.");
  }
  if (msg.stop_reason === "max_tokens") {
    throw new AppError("claude_truncated", "La réponse de Claude a été coupée (trop longue).", "Réessayez : cela arrive rarement.");
  }
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError("claude_bad_json", "Réponse de Claude illisible (JSON invalide).", "Réessayez la génération.");
  }
}

function claudeError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof Anthropic.AuthenticationError)
    return new AppError("claude_auth", "Clé Claude (ANTHROPIC_API_KEY) invalide ou révoquée.", "Vérifiez la clé dans le fichier .env.", e);
  if (e instanceof Anthropic.PermissionDeniedError)
    return new AppError("claude_permission", "Votre clé Claude n'a pas accès à ce modèle.", `Modèle demandé : ${env.claudeModel}.`, e);
  if (e instanceof Anthropic.NotFoundError)
    return new AppError("claude_model", `Modèle Claude introuvable : ${env.claudeModel}.`, "Corrigez CLAUDE_MODEL dans .env.", e);
  if (e instanceof Anthropic.RateLimitError)
    return new AppError("claude_rate_limit", "Limite de requêtes Claude atteinte.", "Attendez une minute puis réessayez.", e);
  if (e instanceof Anthropic.BadRequestError) {
    const m = String((e as Error).message);
    if (/credit|balance|billing/i.test(m))
      return new AppError("claude_credit", "Crédit Claude insuffisant.", "Rechargez votre compte sur console.anthropic.com.", e);
    return new AppError("claude_bad_request", `Requête Claude refusée : ${m}`, undefined, e);
  }
  if (e instanceof Anthropic.InternalServerError)
    return new AppError("claude_server", "Les serveurs de Claude sont surchargés ou en panne.", "Réessayez dans quelques minutes.", e);
  if (e instanceof Anthropic.APIConnectionError)
    return new AppError("claude_network", "Impossible de joindre l'API Claude (réseau).", "Vérifiez la connexion Internet du serveur.", e);
  return new AppError("claude_error", `Erreur Claude : ${(e as Error)?.message ?? e}`, undefined, e);
}

// ---------- Schémas JSON ----------
const S = (props: Json, extra: Json = {}) => ({
  type: "object",
  properties: props,
  required: Object.keys(props),
  additionalProperties: false,
  ...extra,
});
const str = { type: "string" };

const numberSchema = {
  anyOf: [
    S({ value: { type: "number" }, decimals: { type: "integer" }, prefix: str, suffix: str, label: str }),
    { type: "null" },
  ],
};
const sceneSchema = S({ text: str, keyword: str, emoji: str, number: numberSchema, illustration: str, svg: str });

const WRITE_SCHEMA = S({ narration: str });
const VERIFY_SCHEMA = S({
  verdict: { type: "string", enum: ["correcto", "exagerado", "falso"] },
  notes: str,
  correctedFact: str,
  title: str,
  narration: str,
});
const STORYBOARD_SCHEMA = S({
  scenes: { type: "array", items: sceneSchema },
  caption: str,
  hashtags: { type: "array", items: str },
});
const EXTEND_SCHEMA = S({ insertBefore: { type: "integer" }, scenes: { type: "array", items: sceneSchema } });
const REVIEW_SCHEMA = S({ ok: { type: "boolean" }, texts: { type: "array", items: str } });

// ---------- Utilitaires ----------
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const narrationOf = (scenes: Scene[]) => scenes.map((s) => s.text.trim()).join(" ");
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function wordRange(targetSeconds: number): [number, number] {
  // ElevenLabs en espagnol : ~2,8 mots/s. On vise la durée demandée, jamais moins de 170 mots.
  const lo = Math.max(170, Math.round(targetSeconds * 2.65));
  return [lo, Math.max(lo + 25, Math.round(targetSeconds * 3.0))];
}

function cleanScene(s: Scene): Scene {
  const n = s.number;
  return {
    text: s.text.trim(),
    keyword: s.keyword.trim().slice(0, 40),
    emoji: (s.emoji || "✨").trim().slice(0, 8),
    illustration: s.illustration?.trim() ?? "",
    svg: sanitizeSvg(s.svg || ""),
    number: n && Number.isFinite(n.value) ? { ...n, decimals: Math.max(0, Math.min(2, n.decimals ?? 0)) } : null,
  };
}

function fixHashtags(tags: string[]): string[] {
  const out = tags
    .map((t) => "#" + t.replace(/^#+/, "").replace(/\s+/g, ""))
    .filter((t) => t.length > 1);
  for (const d of ["#datoscuriosos", "#cuerpohumano", "#ciencia", "#sabiasque", "#aprendeentiktok"]) {
    if (out.length >= 5) break;
    if (!out.includes(d)) out.push(d);
  }
  return out.slice(0, 5);
}

// ---------- Pipeline script ----------
export async function generateScript(fact: string, targetSeconds: number, progress: Progress = () => {}): Promise<Script> {
  const [minW, maxW] = wordRange(targetSeconds);

  progress("Claude écrit le script…");
  const draft = await askJson<{ narration: string }>(SYSTEM_WRITER, writePrompt(fact, minW, maxW), WRITE_SCHEMA);

  progress("Vérification scientifique (2e passe)…");
  const ver = await askJson<{ verdict: Verdict; notes: string; correctedFact: string; title: string; narration: string }>(
    SYSTEM_VERIFIER,
    verifyPrompt(fact, draft.narration, minW, maxW),
    VERIFY_SCHEMA,
  );

  progress("Découpage en scènes + illustrations…");
  const n = wordCount(ver.narration);
  const minScenes = Math.max(10, Math.round(n / 14));
  const maxScenes = Math.max(minScenes + 2, Math.round(n / 9));
  const sb = await askJson<{ scenes: Scene[]; caption: string; hashtags: string[] }>(
    SYSTEM_STORYBOARD,
    storyboardPrompt(ver.narration, minScenes, maxScenes),
    STORYBOARD_SCHEMA,
  );
  if (!sb.scenes?.length) throw new AppError("claude_no_scenes", "Claude n'a renvoyé aucune scène.", "Réessayez.");
  const scenes = sb.scenes.map(cleanScene);
  // Contrôle : les scènes doivent reprendre le script vérifié.
  if (norm(narrationOf(scenes)) !== norm(ver.narration)) {
    const diff = Math.abs(wordCount(narrationOf(scenes)) - n);
    if (diff > n * 0.15) {
      throw new AppError("claude_scene_mismatch", "Le découpage en scènes ne correspond pas au script.", "Réessayez la génération.");
    }
  }
  return {
    fact,
    title: ver.title,
    verification: { verdict: ver.verdict, notes: ver.notes, correctedFact: ver.correctedFact },
    scenes,
    caption: sb.caption,
    hashtags: fixHashtags(sb.hashtags || []),
  };
}

/** Rallonge le script quand l'audio fait moins de 60 s (scènes vérifiées ajoutées avant la conclusion). */
export async function extendScript(script: Script, missingSeconds: number, progress: Progress = () => {}): Promise<Script> {
  const extraWords = Math.max(12, Math.ceil((missingSeconds + 3) * 2.8));
  progress(`Audio trop court : Claude ajoute ~${extraWords} mots…`);
  const narration = script.scenes.map((s, i) => `[${i}] ${s.text}`).join("\n");
  const ext = await askJson<{ insertBefore: number; scenes: Scene[] }>(
    SYSTEM_WRITER,
    extendPrompt(narration, missingSeconds, extraWords),
    EXTEND_SCHEMA,
  );
  let added = (ext.scenes || []).map(cleanScene);
  if (!added.length) throw new AppError("claude_extend", "Claude n'a pas pu rallonger le script.", "Augmentez la durée cible ou réessayez.");

  progress("Vérification des ajouts…");
  const rev = await askJson<{ ok: boolean; texts: string[] }>(
    SYSTEM_SCENE_REVIEW,
    reviewScenesPrompt(narrationOf(script.scenes), added.map((s) => s.text)),
    REVIEW_SCHEMA,
    "medium",
  );
  if (rev.texts?.length === added.length) added = added.map((s, i) => ({ ...s, text: rev.texts[i].trim() || s.text }));

  const at = Math.min(Math.max(0, ext.insertBefore ?? script.scenes.length - 1), script.scenes.length);
  const scenes = [...script.scenes.slice(0, at), ...added, ...script.scenes.slice(at)];
  return { ...script, scenes };
}

/** Nettoie un script modifié à la main dans l'interface. */
export function normalizeEditedScript(s: Script): Script {
  const scenes = (s.scenes || []).filter((x) => x && x.text && x.text.trim()).map((x) => cleanScene({ ...x, svg: x.svg || "" }));
  if (!scenes.length) throw new AppError("empty_script", "Le script est vide.", "Ajoutez au moins une scène avec du texte.");
  return { ...s, scenes, hashtags: fixHashtags(s.hashtags || []) };
}
