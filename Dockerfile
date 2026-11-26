FROM node:24-alpine AS base

# Enable corepack so the pinned packageManager in package.json (pnpm) is used.
RUN corepack enable
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy workspace manifests and lockfile first for better layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY gakumas-tools/package.json ./gakumas-tools/package.json
COPY packages/gakumas-data/package.json ./packages/gakumas-data/package.json
COPY packages/gakumas-engine/package.json ./packages/gakumas-engine/package.json
COPY packages/gakumas-images/package.json ./packages/gakumas-images/package.json

# onnxruntime-node's postinstall would fetch its CUDA add-on (linux/x64 only)
# from an outside feed. The site never loads it (only the import test
# harnesses do, on CPU, which ships in the package), and a timeout on that
# fetch has failed deploys, so skip it.
ENV ONNXRUNTIME_NODE_INSTALL=skip

# Install with frozen lockfile. Security settings (minimum release age,
# build-script allowlist) are read from pnpm-workspace.yaml / .npmrc.
RUN pnpm install --frozen-lockfile

# Now copy the rest of the source.
COPY ./gakumas-tools ./gakumas-tools
COPY ./packages ./packages

# Development image, run the development server
FROM base AS dev

ENV NODE_ENV=development
CMD ["pnpm", "dev"]

# Install dependencies only when needed
FROM base AS builder
WORKDIR /app

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED=1

ENV NEXT_PUBLIC_GK_IMG_BASE_URL="https://gkimg.ris.moe"

RUN pnpm build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/gakumas-tools/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/gakumas-tools/.next/static ./gakumas-tools/.next/static

RUN mkdir -p gakumas-tools/.next/cache
RUN chown -R nextjs:nodejs gakumas-tools/.next

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD ["node", "gakumas-tools/server.js"]
