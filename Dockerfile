FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 8081

ENV PORT=8081
ENV UPSTREAM_URL=http://host.docker.internal:8080

CMD ["node", "src/index.js"]