FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production DB_PATH=/data/app-plan.db STATIC_DIR=/app/dist PORT=8787
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY shared ./shared
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8787
CMD ["node", "server/index.ts"]
