# Base image with Node.js 20 LTS
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install build dependencies for native modules (sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package descriptors
COPY package*.json ./

# Install dependencies (production + build tools)
RUN npm install

# Copy application files
COPY . .

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Expose server port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

# Start server
CMD ["npm", "start"]
