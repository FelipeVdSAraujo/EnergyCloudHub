FROM node:20-alpine

WORKDIR /app

# Required for Phase 3 Windows orchestration (ssh/scp from API container)
RUN apk add --no-cache openssh-client

# Install deps first (better caching)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy the rest of the app
COPY . .

# Your Express server listens on 4000 (per server.js)
EXPOSE 4000

CMD ["node", "server.js"]
