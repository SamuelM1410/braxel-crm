FROM node:22-bookworm-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY .env.example ./.env.example

ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 8787
CMD ["npm", "start"]
