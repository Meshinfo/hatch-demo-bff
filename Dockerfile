FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json hatch.json server.js ./
COPY public ./public
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
