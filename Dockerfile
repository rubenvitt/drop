FROM node:22-alpine

ENV NODE_ENV=production
ENV HOME=/home/app
ENV XDG_CACHE_HOME=/home/app/.cache
WORKDIR /app

RUN apk add --no-cache python3 make g++
RUN addgroup -S app && adduser -S -G app app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY --chown=app:app src ./src
COPY --chown=app:app public ./public

RUN mkdir -p /uploads /data/meta /data/auth /home/app/.cache && chown -R app:app /uploads /data /app /home/app

USER app
EXPOSE 8080

CMD ["node", "src/start.js"]
