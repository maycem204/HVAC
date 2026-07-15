FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package*.json ./backend/
RUN npm --prefix backend ci --omit=dev
COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:${PORT:-5000}/health || exit 1
CMD ["sh", "-c", "npm --prefix backend run db:init && (npm --prefix backend run pricing:embed || echo 'WARNING: initial pricing embedding failed; server will still start') && node backend/server.js"]
