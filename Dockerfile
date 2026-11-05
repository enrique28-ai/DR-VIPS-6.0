FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY backend ./backend

RUN mkdir -p /app/uploads

EXPOSE 8080

CMD ["node", "backend/src/server.js"]
