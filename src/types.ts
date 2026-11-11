// Types partagés entre le pipeline (Node) et la composition Remotion (navigateur).
// Ce fichier ne doit importer AUCUN module Node.

export interface SceneNumber {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  label?: string;
}

/** Une scène du storyboard (3-5 s de narration). */
export interface Scene {
  /** Texte dit par le prof pendant la scène. */
  text: string;
  /** Mot-clé affiché en gros sur le tableau (1-3 mots). */
  keyword: string;
  /** Emoji animé affiché à côté du mot-clé. */
  emoji: string;
  /** Description de l'illustration (sert à générer le SVG). */
  illustration: string;
  /** Code SVG (viewBox 0 0 800 480) dessiné sur le tableau. */
  svg: string;
  /** Chiffre clé qui défile / "pop" (facultatif). */
  number?: SceneNumber | null;
}

export type Verdict = "correcto" | "exagerado" | "falso";

export interface Verification {
  verdict: Verdict;
  notes: string;
  correctedFact: string;
}

export interface Script {
  fact: string;
  title: string;
  verification: Verification;
  scenes: Scene[];
  caption: string;
  hashtags: string[];
}

/** Alignement caractère par caractère (format ElevenLabs). */
export interface CharAlignment {
  characters: string[];
  starts: number[];
  ends: number[];
}

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

export type Viseme = "A" | "E" | "I" | "O" | "U" | "M" | "F" | "C" | "X";

export interface VisemeSeg {
  v: Viseme;
  start: number;
  end: number;
}

export type ShotKind = "wide" | "board" | "prof" | "push" | "pan";

export interface Shot {
  kind: ShotKind;
  start: number; // secondes
  end: number;
}

export interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children: SvgNode[];
  text?: string;
}

export interface TimedScene extends Scene {
  index: number;
  start: number;
  end: number;
  svgTree: SvgNode | null;
}

export interface SfxCue {
  src: string;
  at: number; // secondes
  volume: number;
}

/** Tout ce dont la composition Remotion a besoin pour dessiner la vidéo. */
export interface VideoProps {
  fps: number;
  durationInFrames: number;
  audioSrc: string;
  musicSrc: string | null;
  musicVolume: number;
  sfx: SfxCue[];
  words: TimedWord[];
  visemes: VisemeSeg[];
  scenes: TimedScene[];
  shots: Shot[];
  /** Instants (s) où le prof fait un geste marqué. */
  gestures: number[];
  title: string;
  seed: number;
  /** Images pré-rendues des parties statiques du décor (accélère beaucoup le rendu). */
  backdrops?: { wall: string; bench: string; board: string } | null;
}
