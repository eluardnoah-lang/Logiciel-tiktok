// Composition principale : caméra virtuelle sur un décor en couches (parallaxe), prof 3D, tableau, sous-titres, audio.
import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { BACKDROP } from "./Backdrop";
import type { VideoProps } from "../src/types";
import { Board, Emoji, formatNumber } from "./components/Board";
import { LabBench, LabWall } from "./components/Lab";
import { Professor } from "./components/Professor";
import { ProgressBar, Subtitles } from "./components/Subtitles";
import { backOut, cameraAt, clamp01, layerTransform } from "./lib";

const PROF = { left: -170, top: 805, width: 980, height: 860 };

const Plate: React.FC<{ src: string }> = ({ src }) => (
  <Img src={src} style={{ position: "absolute", left: -BACKDROP.bleed, top: -BACKDROP.bleed, width: BACKDROP.width, height: BACKDROP.height }} />
);

const Layer: React.FC<{ transform: string; children: React.ReactNode }> = ({ transform, children }) => (
  <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, transformOrigin: "0 0", transform }}>{children}</div>
);

export const DatoCurioso: React.FC<VideoProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const { cam, shotIndex, sinceCut } = cameraAt(props.shots, t, props.seed);
  const shot = props.shots[shotIndex];
  const scene = props.scenes.find((s) => t >= s.start && t < s.end) ?? props.scenes[props.scenes.length - 1];
  const sceneT = scene ? t - scene.start : 0;
  const sceneStarts = props.scenes.map((s) => s.start);
  const bd = props.backdrops;

  // En gros plan sur le prof, le tableau n'est plus visible : le mot-clé (et le chiffre) "pop" en surimpression.
  const sticker = shot?.kind === "prof" && scene;
  const stickerT = Math.min(sinceCut, sceneT);

  return (
    <AbsoluteFill style={{ background: "#3b2a20", overflow: "hidden" }}>
      <Layer transform={layerTransform(cam, 0.65)}>
        {bd ? <Plate src={bd.wall} /> : null}
        <LabWall part={bd ? "live" : "all"} />
      </Layer>
      <Layer transform={layerTransform(cam, 1)}>
        {bd ? <Plate src={bd.board} /> : null}
        <Board scenes={props.scenes} t={t} withChrome={!bd} />
      </Layer>
      <Layer transform={layerTransform(cam, 1)}>
        <div style={{ position: "absolute", left: PROF.left, top: PROF.top, width: PROF.width, height: PROF.height }}>
          <Professor visemes={props.visemes} gestures={props.gestures} sceneStarts={sceneStarts} seed={props.seed % 1000} width={PROF.width} height={PROF.height} />
        </div>
      </Layer>
      <Layer transform={layerTransform(cam, 1.12)}>
        {bd ? <Plate src={bd.bench} /> : null}
        <LabBench part={bd ? "live" : "all"} />
      </Layer>


      {sticker ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 230, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 18, padding: "18px 38px", borderRadius: 30, background: "#1f3b2f", border: "6px solid #9a6337",
              transform: `scale(${backOut(stickerT / 0.35)}) rotate(-3deg)`, boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
            }}
          >
            <span style={{ fontFamily: "Fredoka, sans-serif", fontWeight: 700, fontSize: 84, color: "#FFD166" }}>{scene.keyword}</span>
            <Emoji e={scene.emoji} size={80} t={stickerT} seed={scene.index} />
          </div>
          {scene.number ? (
            <div style={{ fontFamily: "Fredoka, sans-serif", fontWeight: 700, fontSize: 110, color: "#EF476F", textShadow: "0 6px 0 rgba(0,0,0,0.35)", transform: `scale(${backOut((stickerT - 0.2) / 0.35)})` }}>
              {formatNumber(scene.number, clamp01((sceneT - 0.4) / 1.2))}
            </div>
          ) : null}
        </div>
      ) : null}

      <Subtitles words={props.words} t={t} />
      <ProgressBar p={frame / Math.max(1, durationInFrames - 1)} />

      {/* flash blanc très bref à chaque changement de scène */}
      {scene && scene.index > 0 && sceneT < 0.12 ? <AbsoluteFill style={{ background: "#fff", opacity: 0.18 * (1 - sceneT / 0.12) }} /> : null}

      <Audio src={props.audioSrc} />
      {props.musicSrc ? <Audio src={props.musicSrc} loop volume={props.musicVolume} /> : null}
      {props.sfx.map((s, i) => (
        <Sequence key={i} from={Math.max(0, Math.round(s.at * fps))} durationInFrames={Math.round(fps * 1.2)} layout="none">
          <Audio src={s.src} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
