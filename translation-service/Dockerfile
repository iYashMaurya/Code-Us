FROM node:18-alpine

WORKDIR /app


COPY package*.json ./


RUN npm ci --only=production


COPY translation-service.js ./


HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('ioredis').createClient({host:'redis'}).ping().then(() => process.exit(0)).catch(() => process.exit(1))"


CMD ["node", "translation-service.js"]