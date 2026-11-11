// Polices embarquées (aucun accès réseau au moment du rendu).
import { continueRender, delayRender } from "remotion";
import fredoka700 from "@fontsource/fredoka/files/fredoka-latin-700-normal.woff2";
import fredoka600 from "@fontsource/fredoka/files/fredoka-latin-600-normal.woff2";
import nunito800 from "@fontsource/nunito/files/nunito-latin-800-normal.woff2";
import nunito900 from "@fontsource/nunito/files/nunito-latin-900-normal.woff2";

const fonts: [string, string, string][] = [
  ["Fredoka", fredoka700, "700"],
  ["Fredoka", fredoka600, "600"],
  ["Nunito", nunito800, "800"],
  ["Nunito", nunito900, "900"],
];

if (typeof document !== "undefined") {
  const handle = delayRender("Chargement des polices");
  Promise.all(
    fonts.map(([family, url, weight]) => {
      const f = new FontFace(family, `url(${url}) format("woff2")`, { weight });
      return f.load().then((loaded) => document.fonts.add(loaded));
    }),
  )
    .catch((e) => console.error("Police non chargée", e))
    .finally(() => continueRender(handle));
}
