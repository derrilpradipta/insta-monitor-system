# ---------- Builder ----------
FROM mcr.microsoft.com/playwright:v1.65.0-noble AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
# DATABASE_URL dummy hanya agar build tidak gagal saat modul db diimpor.
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"
RUN npm run build

# ---------- Runner ----------
FROM mcr.microsoft.com/playwright:v1.65.0-noble AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma/init.sql ./prisma/init.sql

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
