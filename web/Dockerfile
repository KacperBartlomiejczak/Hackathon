FROM node:22.23.5-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_ADMIN_TOKEN=
ENV VITE_ADMIN_TOKEN=$VITE_ADMIN_TOKEN
RUN npm run build

FROM nginx:1.30.7-alpine
# libxml2 2.13.9-r2 in the base image has a HIGH CVE (Issue #44); r3 is in the Alpine repo.
RUN apk upgrade --no-cache libxml2
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 5173
