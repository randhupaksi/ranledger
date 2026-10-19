FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY server ./server
COPY src/domain ./src/domain
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
USER node
EXPOSE 8787
CMD ["node", "node_modules/tsx/dist/cli.mjs", "server/index.ts"]
