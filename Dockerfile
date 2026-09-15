FROM postgres:16-alpine AS db-init
COPY scripts/init_production_database.sh /usr/local/bin/init_production_database
RUN chmod 0755 /usr/local/bin/init_production_database
ENTRYPOINT ["/bin/sh", "/usr/local/bin/init_production_database"]

FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS web
COPY deploy/container-nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/client /usr/share/nginx/html
EXPOSE 80

FROM node:22-alpine AS backend
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY src ./src
EXPOSE 9090
CMD ["node", "server/index.mjs"]

FROM backend AS runtime
