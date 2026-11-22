FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Move any existing data files to /tmp/data and symlink /app/data so it is always writable
RUN mkdir -p /tmp/data \
    && (cp -r /app/data/. /tmp/data/ 2>/dev/null || true) \
    && rm -rf /app/data \
    && ln -s /tmp/data /app/data \
    && chmod -R 777 /tmp/data

ENV ALLOWED_HOSTS=*
ENV PORT=4310
EXPOSE 4310

CMD ["node", "server/index.mjs"]
