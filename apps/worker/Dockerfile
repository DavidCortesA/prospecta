# La versión de la imagen debe coincidir con la de "playwright" en package.json
FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /app

# Los navegadores ya vienen en la imagen
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    NODE_ENV=production

COPY package.json package-lock.json ./
# tsx es devDependency y es el que ejecuta el worker, por eso se instalan todas
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY src ./src

CMD ["npm", "start"]
