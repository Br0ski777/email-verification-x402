FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --production

COPY . .

EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
