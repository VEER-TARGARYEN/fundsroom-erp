# syntax=docker/dockerfile:1
# Frontend (Vite/React) → built to static files, served by nginx.

FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite inlines VITE_* at BUILD time. A relative "/api" keeps the app same-origin
# (nginx proxies /api to the API service), so the browser never needs CORS.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM nginx:1.27-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
