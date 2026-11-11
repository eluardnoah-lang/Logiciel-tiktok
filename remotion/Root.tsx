import React from "react";
import { Composition } from "remotion";
import type { VideoProps } from "../src/types";
import { DatoCurioso } from "./Video";
import { Backdrop, BACKDROP } from "./Backdrop";

// Props de démonstration pour Remotion Studio (npm run studio). En production, les vraies props sont injectées.
const demo: VideoProps = {
  fps: 30,
  durationInFrames: 150,
  audioSrc: "",
  musicSrc: null,
  musicVolume: 0,
  sfx: [],
  words: [
    { text: "¿Sabías", start: 0.2, end: 0.7 },
    { text: "que", start: 0.7, end: 0.85 },
    { text: "tu", start: 0.85, end: 1.0 },
    { text: "cuerpo", start: 1.0, end: 1.5 },
  ],
  visemes: [],
  scenes: [
    { index: 0, start: 0, end: 5, text: "¿Sabías que tu cuerpo...", keyword: "Calor", emoji: "🔥", illustration: "", svg: "", number: { value: 100, suffix: " W" }, svgTree: null },
  ],
  shots: [{ kind: "wide", start: 0, end: 5 }],
  gestures: [0.5],
  title: "Demo",
  seed: 1,
};

export const RemotionRoot: React.FC = () => (
  <>
  <Composition
    id="Backdrop"
    component={Backdrop as unknown as React.FC<Record<string, unknown>>}
    width={BACKDROP.width}
    height={BACKDROP.height}
    fps={30}
    durationInFrames={1}
    defaultProps={{ layer: "wall" }}
  />
  <Composition
    id="DatoCurioso"
    component={DatoCurioso as unknown as React.FC<Record<string, unknown>>}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={150}
    defaultProps={demo as unknown as Record<string, unknown>}
    calculateMetadata={({ props }) => {
      const p = props as unknown as VideoProps;
      return { durationInFrames: Math.max(1, p.durationInFrames), fps: p.fps };
    }}
  />
  </>
);
