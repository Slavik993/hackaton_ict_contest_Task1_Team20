FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache chromium nss nsq nspr libatk at-spi2-atk libcups libdrm libxkbcommon libxcomposite libxdamage libxfixes libxrandr gb-dev pango cairo alsa-lib ttf-freefont

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .

RUN mkdir -p public/uploads data public/videos

EXPOSE 3000

CMD ["node", "server.js"]
