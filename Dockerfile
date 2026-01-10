FROM node:20-slim

# Install build tools for native tree-sitter modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Pre-download models to make Docker image self-contained and fast
RUN node -e 'import { pipeline } from "@huggingface/transformers"; \
    await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5"); \
    await pipeline("summarization", "Xenova/distilbart-cnn-6-6"); \
    await pipeline("text-classification", "Xenova/bge-reranker-base");'

# Default environment variables
ENV NODE_ENV=production
ENV EMBEDDING_MODEL=Xenova/bge-small-en-v1.5

# The MCP server runs on stdio, so we don't EXPOSE ports
ENTRYPOINT ["npm", "start"]
