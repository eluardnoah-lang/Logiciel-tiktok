# 🧪 Datos curiosos — générateur automatique de vidéos TikTok

Vous tapez **un fait insolite sur le corps humain** (ex. « on éternue à 160 km/h »), vous cliquez sur **Crear vídeo**, et vous obtenez un **MP4 vertical prêt à publier** :

- 1080×1920, 30 fps, H.264 + AAC, **60 à 75 s** (jamais moins de 60 s)
- **tout en espagnol** : voix, sous-titres, textes à l'écran
- un **professeur 3D** cartoon (blouse, lunettes, moustache) dans un **laboratoire** : il cligne des yeux, respire, bouge la tête, fait des gestes vers le tableau et **parle en lip-sync**
- un **tableau noir** qui dessine à la craie une illustration animée (SVG générés par Claude) + le mot-clé en gros + les chiffres clés qui défilent
- un changement de plan toutes les 2-3 s (zooms, travellings, gros plans), emojis animés, petits « whoosh/pop », musique douce
- sous-titres discrets (2-4 mots, mot prononcé en jaune), barre de progression en haut
- un fichier texte avec **légende TikTok + 5 hashtags**

Tout se pilote depuis une **page web utilisable sur iPad**.

---

## 1. Architecture

```
iPad (Safari) ──► Serveur Node.js (src/server.ts) ──► data/jobs/<id>/  (script, voix, vidéo…)
                     │
                     ├─ 1. SCRIPT   src/pipeline/script.ts   → API Claude (claude-opus-5-5)
                     │                 écriture → vérification scientifique (2e passe) → scènes + SVG + légende
                     ├─ 2. VOIX     src/pipeline/voice/       → ElevenLabs « with-timestamps » (alignement caractère par caractère)
                     │                 ou votre MP3 (transcription ElevenLabs Scribe + alignement sur le script)
                     │                 audio < 60 s ? → Claude rallonge le script → nouvelle voix
                     ├─ ALIGNEMENT  src/pipeline/alignment.ts → mots horodatés + visèmes (lip-sync)
                     ├─ PARTITION   src/pipeline/timeline.ts  → temps des scènes, plans caméra, gestes, effets sonores
                     └─ 3. RENDU    src/pipeline/render.ts    → Remotion (React) + Three.js → MP4
                                       remotion/  (composition : décor, prof 3D, tableau, sous-titres)
```

| Partie | Techno |
|---|---|
| Interface | HTML/CSS/JS sans framework (`public/`), pensée pour l'écran tactile |
| Serveur | Node.js 22, Express, TypeScript (exécuté avec `tsx`) |
| Script | SDK officiel `@anthropic-ai/sdk`, modèle `claude-opus-5-5`, sorties JSON structurées |
| Voix | API ElevenLabs (`/with-timestamps`, `/speech-to-text`), modèle `eleven_multilingual_v2` |
| Vidéo | Remotion 4 (React), `@react-three/fiber` + Three.js pour le prof 3D |
| Audio | ffmpeg (normalisation de la voix), musique et bruitages **générés par le code** (libres de droits) |

Chaque étape est un module séparé : vous pouvez améliorer le prof (`remotion/components/Professor.tsx`), le décor (`Lab.tsx`), le tableau (`Board.tsx`), les prompts (`src/pipeline/prompts.ts`)… sans toucher au reste.

---

## 2. Les clés API

1. **Claude** : créez une clé sur <https://console.anthropic.com/settings/keys> (il faut un peu de crédit ; une vidéo coûte quelques dizaines de centimes).
2. **ElevenLabs** : <https://elevenlabs.io/app/settings/api-keys> (cochez « Text to Speech », « Speech to Text » et « Voices » en lecture). Une vidéo ≈ 1 100 caractères.

Copiez `.env.example` en `.env` et collez vos clés :

```
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=sk_...
```

> Sur un hébergeur (Codespaces, Railway…), on ne crée pas de fichier `.env` : on renseigne ces mêmes noms dans les « secrets » / « variables » de l'hébergeur.

---

## 3. Utilisation depuis l'iPad — option recommandée : GitHub Codespaces (en un clic, rien à installer)

Codespaces lance le logiciel sur un ordinateur dans le cloud de GitHub, et vous l'utilisez dans Safari. Gratuit jusqu'à ~30 h/mois sur une machine 4 cœurs (largement assez : une vidéo prend ~10-20 min de rendu).

**Une seule fois :**
1. Dans Safari, allez sur <https://github.com/settings/codespaces> → **New secret** : ajoutez `ANTHROPIC_API_KEY` puis `ELEVENLABS_API_KEY`, et autorisez le dépôt `Logiciel-tiktok`.

**À chaque utilisation :**
1. Ouvrez <https://codespaces.new/eluardnoah-lang/Logiciel-tiktok> → choisissez une machine **4 cores** (ou 8 pour un rendu 2× plus rapide) → **Create codespace**.
   La première fois, l'installation prend ~5 min (ensuite le codespace redémarre en quelques secondes depuis <https://github.com/codespaces>).
2. Le serveur démarre tout seul. Ouvrez l'onglet **Ports** en bas de l'éditeur → cliquez sur l'icône 🌐 de la ligne **3000** : la page du générateur s'ouvre.
   Astuce : dans Safari, bouton Partager → **Sur l'écran d'accueil** pour avoir une icône comme une appli.
3. Quand vous avez fini, fermez l'onglet : le codespace s'arrête seul après 30 min d'inactivité (vos vidéos restent dedans tant que vous ne le supprimez pas — pensez à les télécharger).

Si le serveur ne s'est pas lancé : dans le terminal du codespace tapez `npm start`.

### Autres options

- **Sur un Mac/PC à la maison** (le plus rapide) : installez [Node.js 22](https://nodejs.org) et ffmpeg (`brew install ffmpeg` sur Mac), puis :
  ```bash
  git clone https://github.com/eluardnoah-lang/Logiciel-tiktok.git
  cd Logiciel-tiktok
  npm install
  cp .env.example .env      # puis collez vos clés dans .env
  npm start
  ```
  Le terminal affiche une adresse du type `http://192.168.1.20:3000` : ouvrez-la dans Safari sur l'iPad (même Wi-Fi).
- **Hébergement permanent (Railway, Render, Fly.io, VPS)** : le `Dockerfile` est prêt. Créez un service à partir du dépôt GitHub, ajoutez les variables `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` et **`APP_PASSWORD`** (mot de passe demandé par la page, indispensable si l'adresse est publique), un volume monté sur `/data`, et au moins 2 vCPU / 4 Go de RAM.

---

## 4. Créer une vidéo

1. **Dato curioso** : tapez le fait (en français ou en espagnol), touchez **🎬 Crear vídeo**.
2. Étape **1. Script** (~1-2 min) : Claude écrit le script, une 2e passe le vérifie scientifiquement.
   - Un encadré indique le verdict : ✅ correct, ⚠️ exagéré (reformulé), ❌ faux (le script raconte la vraie version), avec l'explication.
3. **Relisez / modifiez** : chaque scène a son texte, son mot-clé et son emoji (🗑️ pour supprimer une scène, « + Ajouter une scène »). Le compteur estime la durée.
4. Choisissez la **voix** :
   - **ElevenLabs** (voice_id des réglages),
   - **Mon propre MP3** : le texte enregistré doit suivre le script ; il est transcrit et aligné automatiquement,
   - **Voix de test** : voix robotique hors-ligne, pour essayer sans clé ElevenLabs.
5. Touchez **🎙️ Générer la voix et la vidéo**. Étapes **2. Voix** puis **3. Rendu** (barre de progression). Si l'audio fait moins de 60 s, le script est rallongé automatiquement puis la voix régénérée.
6. Quand c'est prêt : lecture directe, **⬇️ Télécharger le MP4**, **📝 Légende + hashtags**, **📋 Copier la légende**.
   - Sur iPad : touchez *Télécharger*, puis dans les Téléchargements de Safari, ouvrez la vidéo → Partager → **Enregistrer la vidéo** (elle arrive dans Photos, prête pour TikTok).
7. L'**Historique** garde toutes les vidéos (miniature, durée, statut). Touchez-en une pour la revoir, la modifier ou refaire le rendu.

### Réglages (⚙️)

- **voice_id ElevenLabs** : bouton « Charger mes voix » pour choisir dans votre liste (prenez une voix espagnole de la *Voice Library*, ajoutée à « My voices »).
- **Modèle de voix** : `eleven_multilingual_v2` recommandé pour l'espagnol.
- **Vitesse**, **durée cible** (60-90 s), **musique on/off** et son volume, **effets sonores on/off**.

---

## 5. Messages d'erreur fréquents

| Message | Solution |
|---|---|
| « La clé ANTHROPIC_API_KEY / ELEVENLABS_API_KEY est manquante » | Ajoutez-la (`.env` ou secrets Codespaces) puis redémarrez le serveur. |
| « Clé … invalide » | Recopiez la clé (sans espace), vérifiez qu'elle n'a pas été révoquée. |
| « Quota ElevenLabs dépassé » | Attendez le renouvellement mensuel, changez d'offre, ou utilisez « Mon propre MP3 ». |
| « voice_id ElevenLabs introuvable » | Réglages → « Charger mes voix » et choisissez-en une. |
| « Crédit Claude insuffisant » | Rechargez sur console.anthropic.com. |
| « Le rendu 3D a échoué (WebGL) » | Laissez `REMOTION_GL=swangle` (valeur par défaut). |
| « Le serveur a redémarré pendant la création » | Ouvrez la vidéo dans l'historique et relancez l'étape. |

---

## 6. Ligne de commande (facultatif)

```bash
npm run cli -- --fact "Estornudamos a 160 km/h"                    # tout automatique
npm run cli -- --fact "..." --voice local                            # voix de test hors-ligne
npm run cli -- --script examples/calor/script.json --audio voz.mp3  # votre MP3
npm run example        # vidéo d'exemple (script fourni + voix de test), sans aucune clé
npm run check -- <id>  # contrôle qualité : format, durée ≥ 60 s, images figées, lip-sync, sous-titres
npm run studio         # Remotion Studio pour retoucher l'animation
```

Les vidéos sont dans `data/jobs/<id>/` (`video.mp4`, `caption.txt`, `script.json`, `voice.mp3`, `alignment.json`).

---

## 7. Améliorer chaque partie

| Je veux changer… | Fichier |
|---|---|
| le ton, la structure du script, le style des dessins | `src/pipeline/prompts.ts` |
| le découpage en plans caméra, les gestes, les bruitages | `src/pipeline/timeline.ts` |
| le professeur 3D (visage, couleurs, gestes) | `remotion/components/Professor.tsx` |
| le labo | `remotion/components/Lab.tsx` |
| le tableau, le mot-clé, les chiffres | `remotion/components/Board.tsx`, `SvgTree.tsx` |
| les sous-titres | `remotion/components/Subtitles.tsx` |
| la caméra, le lip-sync | `remotion/lib.ts` |
| la musique et les bruitages | `src/pipeline/assets.ts` |

Note technique : les parties fixes du décor sont pré-rendues une fois en PNG (`data/assets/backdrop_*.png`, recalculées automatiquement si `Lab.tsx`/`Board.tsx` changent) — c'est ce qui rend le rendu ~3× plus rapide.
