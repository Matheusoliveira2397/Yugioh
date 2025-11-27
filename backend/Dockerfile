FROM node:20-alpine

WORKDIR /app

# Instalar dependências do sistema
RUN apk add --no-cache python3 make g++

# Copiar package files
COPY package*.json ./

# Instalar dependências e recompilar bcrypt
RUN npm install --legacy-peer-deps && npm rebuild bcrypt --build-from-source

# Copiar código fonte
COPY . .

# Build da aplicação
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
