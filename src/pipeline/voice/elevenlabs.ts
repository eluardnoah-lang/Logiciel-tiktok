// ÉTAPE 2 — VOIX via ElevenLabs : synthèse « with-timestamps » et transcription (Scribe) d'un MP3 importé.
import fs from "node:fs";
import { env, type Settings } from "../../config.js";
import { AppError, missingKey } from "../../errors.js";
import type { CharAlignment, TimedWord } from "../../types.js";

const API = "https://api.elevenlabs.io/v1";

async function elevenError(res: Response): Promise<AppError> {
  let body: any = null;
  let raw = "";
  try {
    raw = await res.text();
    body = JSON.parse(raw);
  } catch {}
  const detail = body?.detail;
  const status: string = (typeof detail === "object" && detail?.status) || "";
  const message: string = (typeof detail === "object" ? detail?.message : typeof detail === "string" ? detail : "") || raw.slice(0, 200);
  if (status === "quota_exceeded" || /quota/i.test(message))
    return new AppError("eleven_quota", "Quota ElevenLabs dépassé (plus assez de caractères ce mois-ci).", "Attendez le renouvellement, changez d'offre, ou importez votre propre MP3.");
  if (res.status === 401)
    return new AppError("eleven_auth", "Clé ElevenLabs (ELEVENLABS_API_KEY) invalide ou sans permission.", "Vérifiez la clé dans .env (permission « Text to Speech » et « Speech to Text »).");
  if (status === "voice_not_found" || (res.status === 404 && /voice/i.test(message)))
    return new AppError("eleven_voice", "voice_id ElevenLabs introuvable.", "Copiez l'identifiant d'une voix depuis elevenlabs.io › Voices, puis collez-le dans Réglages.");
  if (res.status === 429)
    return new AppError("eleven_rate", "ElevenLabs est saturé ou trop de requêtes simultanées.", "Réessayez dans une minute.");
  if (status === "model_not_found" || /model/i.test(status))
    return new AppError("eleven_model", `Modèle de voix ElevenLabs invalide.`, "Utilisez par exemple eleven_multilingual_v2 dans Réglages.");
  return new AppError("eleven_error", `Erreur ElevenLabs (${res.status}) : ${message || status}`);
}

async function call(url: string, init: RequestInit): Promise<Response> {
  if (!env.elevenKey) throw missingKey("ELEVENLABS_API_KEY");
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { "xi-api-key": env.elevenKey, ...(init.headers || {}) }, signal: AbortSignal.timeout(5 * 60 * 1000) });
  } catch (e) {
    throw new AppError("eleven_network", "Impossible de joindre ElevenLabs (réseau).", "Vérifiez la connexion Internet du serveur.", e);
  }
  if (!res.ok) throw await elevenError(res);
  return res;
}

export interface TtsResult {
  audio: Buffer;
  alignment: CharAlignment;
}

/** Synthèse vocale avec alignement caractère par caractère. */
export async function elevenTts(text: string, s: Settings): Promise<TtsResult> {
  const body: Record<string, unknown> = {
    text,
    model_id: s.voiceModel,
    voice_settings: {
      stability: s.voiceStability,
      similarity_boost: s.voiceSimilarity,
      style: s.voiceStyle,
      use_speaker_boost: true,
      speed: s.voiceSpeed,
    },
  };
  // Seuls certains modèles acceptent le forçage de langue.
  if (/flash|turbo|v3/.test(s.voiceModel)) body.language_code = "es";
  const res = await call(`${API}/text-to-speech/${encodeURIComponent(s.voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const j: any = await res.json();
  const al = j.alignment || j.normalized_alignment;
  if (!j.audio_base64 || !al) throw new AppError("eleven_bad_response", "Réponse ElevenLabs incomplète (audio ou alignement manquant).");
  return {
    audio: Buffer.from(j.audio_base64, "base64"),
    alignment: { characters: al.characters, starts: al.character_start_times_seconds, ends: al.character_end_times_seconds },
  };
}

/** Transcription horodatée mot par mot d'un fichier audio (pour un MP3 importé). */
export async function elevenTranscribe(file: string, s: Settings): Promise<TimedWord[]> {
  const form = new FormData();
  form.append("model_id", s.sttModel);
  form.append("language_code", "es");
  form.append("timestamps_granularity", "word");
  form.append("tag_audio_events", "false");
  form.append("file", new Blob([fs.readFileSync(file)]), "voz.mp3");
  const res = await call(`${API}/speech-to-text`, { method: "POST", body: form });
  const j: any = await res.json();
  const words: TimedWord[] = (j.words || [])
    .filter((w: any) => w.type === "word" && String(w.text).trim())
    .map((w: any) => ({ text: String(w.text).trim(), start: Number(w.start), end: Number(w.end) }));
  if (!words.length) throw new AppError("stt_empty", "Aucune parole détectée dans le MP3.", "Vérifiez le fichier audio.");
  return words;
}

/** Liste des voix du compte (pour choisir le voice_id depuis l'interface). */
export async function elevenVoices(): Promise<{ id: string; name: string; labels: string }[]> {
  const res = await call(`${API}/voices`, { method: "GET" });
  const j: any = await res.json();
  return (j.voices || []).map((v: any) => ({
    id: v.voice_id,
    name: v.name,
    labels: Object.values(v.labels || {}).join(", "),
  }));
}
