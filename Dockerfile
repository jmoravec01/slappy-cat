FROM alpine:3.22
RUN apk add --no-cache nodejs && addgroup -S -g 10001 node && adduser -S -u 10001 -G node node
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data NODE_OPTIONS=--disable-warning=ExperimentalWarning
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY shared/sim.js shared/maps.json shared/skins.js ./shared/
COPY public ./public
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
CMD ["node", "server/server.js"]
