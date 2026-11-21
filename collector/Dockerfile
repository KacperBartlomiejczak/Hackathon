FROM node:22.23.5-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Browsers are preinstalled in this image; tag must match the playwright npm version.
FROM mcr.microsoft.com/playwright:v1.65.1-noble
WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY sources.yaml ./
# Seeds the empty collector_data volume on first creation (synthetic fixtures, not UKNF data).
COPY fixtures/sample /data/sample
RUN chown -R pwuser:pwuser /app /data
USER pwuser
CMD ["node", "dist/index.js"]
