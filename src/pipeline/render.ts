// ÉTAPE 3 — RENDU VIDÉO avec Remotion (React + Three.js) -> MP4 H.264 + AAC, 1080x1920, 30 fps.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import crypto from "node:crypto";
import { ASSETS_DIR, env, ROOT } from "../config.js";
import { AppError } from "../errors.js";
import type { VideoProps } from "../types.js";

let bundlePromise: Promise<string> | null = null;
export function getBundle(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({ entryPoint: path.join(ROOT, "remotion", "index.ts"), publicDir: path.join(ROOT, "remotion", "public") }).catch((e) => {
      bundlePromise = null;
      throw new AppError("bundle_failed", "La préparation du rendu (bundle Remotion) a échoué.", String(e?.message || e));
    });
  }
  return bundlePromise;
}

const MIME: Record<string, string> = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".json": "application/json" };

/** Mini serveur HTTP local qui sert les fichiers audio au navigateur de rendu. */
export function serveDirs(dirs: Record<string, string>): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent((req.url || "/").split("?")[0]);
    const [, prefix, ...rest] = u.split("/");
    const base = dirs[prefix];
    const file = base ? path.join(base, ...rest) : "";
    if (!base || !file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    const stat = fs.statSync(file);
    const type = MIME[path.extname(file)] || "application/octet-stream";
    const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Accept-Ranges", "bytes");
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : stat.size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size });
      fs.createReadStream(file).pipe(res);
    }
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    }),
  );
}

function browserOpts() {
  return {
    browserExecutable: env.browserExecutable,
    chromiumOptions: { gl: env.gl },
  } as const;
}

/**
 * Pré-rend les parties statiques du décor (mur, paillasse, cadre du tableau) en PNG.
 * Recalculé automatiquement si le code du décor change. Renvoie les noms de fichiers (dans ASSETS_DIR).
 */
export async function ensureBackdrops(): Promise<{ wall: string; bench: string; board: string }> {
  const src = ["Lab.tsx", "Board.tsx"].map((f) => fs.readFileSync(path.join(ROOT, "remotion", "components", f), "utf8")).join("");
  const v = crypto.createHash("sha1").update(src).digest("hex").slice(0, 10);
  const out = { wall: `backdrop_wall_${v}.png`, bench: `backdrop_bench_${v}.png`, board: `backdrop_board_${v}.png` };
  const missing = (Object.keys(out) as (keyof typeof out)[]).filter((k) => !fs.existsSync(path.join(ASSETS_DIR, out[k])));
  if (missing.length) {
    const serveUrl = await getBundle();
    for (const layer of missing) {
      const inputProps = { layer };
      const composition = await selectComposition({ serveUrl, id: "Backdrop", inputProps, ...browserOpts() });
      const tmp = path.join(ASSETS_DIR, `tmp_${out[layer]}`);
      await renderStill({ serveUrl, composition, inputProps, output: tmp, imageFormat: "png", scale: 1.6, ...browserOpts() });
      fs.renameSync(tmp, path.join(ASSETS_DIR, out[layer]));
    }
  }
  return out;
}

export interface RenderOptions {
  props: VideoProps;
  output: string;
  onProgress?: (p: number) => void;
}

export async function renderVideo({ props, output, onProgress }: RenderOptions): Promise<void> {
  const serveUrl = await getBundle();
  const inputProps = props as unknown as Record<string, unknown>;
  try {
    const composition = await selectComposition({ serveUrl, id: "DatoCurioso", inputProps, ...browserOpts() });
    const cpus = os.cpus().length;
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: "h264",
      audioCodec: "aac",
      audioBitrate: "192k",
      crf: 20,
      pixelFormat: "yuv420p",
      outputLocation: output,
      concurrency: env.renderConcurrency ?? Math.max(1, Math.min(8, cpus - 1)),
      timeoutInMilliseconds: 120000,
      onProgress: ({ progress }) => onProgress?.(progress),
      ...browserOpts(),
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    const m = String((e as Error)?.message || e);
    if (/WebGL|context could not be created/i.test(m))
      throw new AppError("render_webgl", "Le rendu 3D a échoué (WebGL indisponible).", "Mettez REMOTION_GL=swangle dans .env.", e);
    if (/ENOSPC|no space/i.test(m)) throw new AppError("render_disk", "Plus d'espace disque pour le rendu.", "Supprimez d'anciennes vidéos dans l'historique.", e);
    if (/browser|chrome|executable/i.test(m))
      throw new AppError("render_browser", "Chrome headless introuvable ou impossible à lancer.", "Laissez REMOTION_BROWSER_EXECUTABLE vide pour le téléchargement automatique, ou indiquez un chemin valide.", e);
    throw new AppError("render_failed", `Le rendu vidéo a échoué : ${m.slice(0, 300)}`, "Réessayez le rendu depuis l'historique.", e);
  }
}

/** Image fixe d'une frame (pour les miniatures et les vérifications). */
export async function renderFrame(props: VideoProps, frame: number, output: string): Promise<void> {
  const serveUrl = await getBundle();
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: "DatoCurioso", inputProps, ...browserOpts() });
  await renderStill({ serveUrl, composition, inputProps, frame, output, imageFormat: "jpeg", jpegQuality: 85, ...browserOpts() });
}
