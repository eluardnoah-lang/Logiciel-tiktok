/** Erreur "propre" : un code machine + un message compréhensible pour l'utilisateur. */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public hint?: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toUserError(err: unknown): { code: string; message: string; hint?: string } {
  if (err instanceof AppError) return { code: err.code, message: err.message, hint: err.hint };
  const msg = err instanceof Error ? err.message : String(err);
  return { code: "unexpected", message: `Erreur inattendue : ${msg}` };
}

export function missingKey(name: "ANTHROPIC_API_KEY" | "ELEVENLABS_API_KEY"): AppError {
  const where = name === "ANTHROPIC_API_KEY" ? "https://console.anthropic.com/settings/keys" : "https://elevenlabs.io/app/settings/api-keys";
  return new AppError(
    "missing_key",
    `La clé ${name} est manquante.`,
    `Ajoutez-la dans le fichier .env (ou dans les variables d'environnement de l'hébergeur), puis redémarrez. Clé disponible ici : ${where}`,
  );
}
