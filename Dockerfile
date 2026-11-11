# Image prête à héberger (Railway, Render, Fly.io, un VPS…)
FROM node:22-bookworm-slim
WORKDIR /app
COPY scripts/setup-linux.sh scripts/
RUN bash scripts/setup-linux.sh && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci && npx remotion browser ensure
COPY . .
ENV PORT=3000 DATA_DIR=/data REMOTION_GL=swangle
VOLUME /data
EXPOSE 3000
CMD ["npx", "tsx", "src/server.ts"]
