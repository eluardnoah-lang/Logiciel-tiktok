// Voix de TEST hors-ligne (espeak-ng). Robotique : à n'utiliser que pour vérifier le pipeline sans clé ElevenLabs.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../config.js";
import { AppError } from "../../errors.js";
import type { TimedWord } from "../../types.js";

export async function localTts(text: string, outWav: string): Promise<{ words: TimedWord[]; duration: number }> {
  const dir = path.dirname(outWav);
  const txt = path.join(dir, "local_tts.txt");
  const js = path.join(dir, "local_tts.json");
  fs.writeFileSync(txt, text);
  await new Promise<void>((resolve, reject) =>
    execFile("python3", [path.join(ROOT, "tools", "espeak_tts.py"), txt, outWav, js, "es", "158"], (err, _o, stderr) =>
      err
        ? reject(new AppError("local_tts", "Voix de test indisponible (espeak-ng).", `Installez espeak-ng (apt install espeak-ng). Détail : ${String(stderr).slice(-200)}`))
        : resolve(),
    ),
  );
  const j = JSON.parse(fs.readFileSync(js, "utf8"));
  return { words: j.words, duration: j.duration };
}
