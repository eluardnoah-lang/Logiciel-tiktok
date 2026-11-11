#!/usr/bin/env bash
# Installe les dépendances système (Debian/Ubuntu) : ffmpeg, voix de test, emojis couleur, bibliothèques de Chrome headless.
set -e
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
$SUDO apt-get update
DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y --no-install-recommends \
  ffmpeg espeak-ng python3 fonts-noto-color-emoji ca-certificates \
  libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2t64 libxrandr2 libxkbcommon0 \
  libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2 libdrm2 libxshmfence1 \
  || DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y --no-install-recommends \
  ffmpeg espeak-ng python3 fonts-noto-color-emoji ca-certificates \
  libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 \
  libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2 libdrm2 libxshmfence1
