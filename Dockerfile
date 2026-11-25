# Images de production : le client (fichiers statiques servis par nginx) et le serveur Colyseus.
# Construites directement sur le Raspberry Pi par le workflow de déploiement : pas de registre à gérer.

# --- Dépendances (workspaces npm) -----------------------------------------------------------
FROM node:22 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
RUN npm ci

# --- Build du client (Vite) -----------------------------------------------------------------
FROM deps AS client-build
# Adresse du serveur de jeu vue par le navigateur (ex. wss://hote/ws). Vide : même hôte, port 2567.
ARG VITE_SERVER_URL=""
ENV VITE_SERVER_URL=$VITE_SERVER_URL
COPY tsconfig.base.json ./
COPY packages packages
RUN npm run build -w @game/client

# --- Image « web » : client statique + relais WebSocket vers le serveur ----------------------
FROM nginx:alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=client-build /app/packages/client/dist /usr/share/nginx/html
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

# --- Image « server » : Colyseus (TypeScript exécuté par tsx, le package shared est livré en .ts) ---
FROM node:22-slim AS server
WORKDIR /app
ENV NODE_ENV=production PORT=2567
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json tsconfig.base.json ./
COPY --chown=node:node packages/shared packages/shared
COPY --chown=node:node packages/server packages/server
USER node
WORKDIR /app/packages/server
EXPOSE 2567
# Le conteneur est sain quand le port répond.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "require('net').connect(2567,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"]
CMD ["npx", "tsx", "src/index.ts"]
