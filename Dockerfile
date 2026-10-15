FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/game-sdk/package.json ./packages/game-sdk/package.json
COPY games/egyptian-war/package.json ./games/egyptian-war/package.json
RUN npm ci

COPY tsconfig.json tsconfig.test.json ./
COPY gamehub.config.json ./
COPY packages ./packages
COPY games ./games
COPY src ./src
COPY public ./public
COPY test ./test
COPY scripts ./scripts

RUN npm test
RUN npm run verify:packages


FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/game-sdk/package.json ./packages/game-sdk/package.json
COPY games/egyptian-war/package.json ./games/egyptian-war/package.json
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/packages/game-sdk/dist ./packages/game-sdk/dist
COPY --from=build /app/games/egyptian-war/dist ./games/egyptian-war/dist
COPY --from=build /app/games/egyptian-war/public ./games/egyptian-war/public
COPY public ./public
COPY gamehub.config.json ./gamehub.config.json

EXPOSE 3000

USER node

CMD ["node", "dist/server.js"]
