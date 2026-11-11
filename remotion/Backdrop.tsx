// Parties statiques du décor, rendues UNE fois en PNG puis réutilisées comme images
// (en rendu logiciel, redessiner dégradés/ombres/SVG à chaque image coûte très cher).
import React from "react";
import { AbsoluteFill } from "remotion";
import { BoardChrome } from "./components/Board";
import { LabBench, LabWall } from "./components/Lab";

export const BACKDROP = { bleed: 220, width: 1520, height: 2360 };
export type BackdropLayer = "wall" | "bench" | "board";

export const Backdrop: React.FC<{ layer: BackdropLayer }> = ({ layer }) => (
  <AbsoluteFill>
    <div style={{ position: "absolute", left: BACKDROP.bleed, top: BACKDROP.bleed, width: 1080, height: 1920 }}>
      {layer === "wall" ? <LabWall part="static" /> : layer === "bench" ? <LabBench part="static" /> : <BoardChrome />}
    </div>
  </AbsoluteFill>
);
