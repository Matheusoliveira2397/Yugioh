# 🐳 Dockerfiles Prontos para Copiar e Colar

Este arquivo contém todos os Dockerfiles necessários para deploy do seu jogo Yu-Gi-Oh! Online.

---

## 📦 Backend - Dockerfile para Fly.io

**Arquivo:** `backend/Dockerfile.fly`

```dockerfile
# Dockerfile otimizado para Fly.io
# Multi-stage build para reduzir tamanho da imagem final

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependências do sistema necessárias para compilar
RUN apk add --no-cache python3 make g++

# Copiar arquivos de dependências
COPY package*.json ./
COPY tsconfig.json ./
COPY nest-cli.json ./

# Instalar dependências (incluindo devDependencies para build)
RUN npm ci --legacy-peer-deps

# Copiar código fonte
COPY . .

# Build da aplicação
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Instalar apenas dependências do sistema necessárias para runtime
RUN apk add --no-cache python3 make g++

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar apenas dependências de produção
RUN npm ci --only=production --legacy-peer-deps && \
    npm rebuild bcrypt --build-from-source

# Copiar build do stage anterior
COPY --from=builder /app/dist ./dist

# Criar diretório para uploads
RUN mkdir -p uploads/avatars uploads/images

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/docs', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de start
CMD ["npm", "run", "start:prod"]
```

---

## 📦 Backend - Dockerfile Geral (Render.com, Railway, etc.)

**Arquivo:** `backend/Dockerfile`

```dockerfile
# Dockerfile para Backend (Render.com, Railway, etc.)
# Multi-stage build para reduzir tamanho da imagem final

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependências do sistema necessárias para compilar
RUN apk add --no-cache python3 make g++

# Copiar arquivos de dependências
COPY package*.json ./
COPY tsconfig.json ./
COPY nest-cli.json ./

# Instalar dependências (incluindo devDependencies para build)
RUN npm ci --legacy-peer-deps

# Copiar código fonte
COPY . .

# Build da aplicação
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Instalar apenas dependências do sistema necessárias para runtime
RUN apk add --no-cache python3 make g++

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar apenas dependências de produção
RUN npm ci --only=production --legacy-peer-deps && \
    npm rebuild bcrypt --build-from-source

# Copiar build do stage anterior
COPY --from=builder /app/dist ./dist

# Criar diretório para uploads
RUN mkdir -p uploads/avatars uploads/images

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/docs', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de start
CMD ["npm", "run", "start:prod"]
```

---

## 🎨 Frontend - Dockerfile

**Arquivo:** `frontend/Dockerfile`

```dockerfile
# Dockerfile para Frontend (Vercel, Netlify, Render.com, etc.)
# Multi-stage build para reduzir tamanho da imagem final

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY . .

# Build da aplicação
RUN npm run build

# Production stage
FROM nginx:alpine

# Copiar build do frontend
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuração customizada do Nginx para SPA
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /api { \
        return 404; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Expor porta 80
EXPOSE 80

# Iniciar Nginx
CMD ["nginx", "-g", "daemon off;"]
```

---

## 📝 Notas Importantes

### Backend
- ✅ Usa multi-stage build para reduzir tamanho da imagem
- ✅ Instala dependências necessárias para compilar `bcrypt`
- ✅ Health check configurado para `/api/docs`
- ✅ Cria diretórios necessários para uploads
- ✅ Usa `npm ci` para instalação mais rápida e confiável

### Frontend
- ✅ Usa Nginx para servir arquivos estáticos
- ✅ Configurado para SPA (Single Page Application)
- ✅ Todas as rotas redirecionam para `index.html`
- ✅ Build otimizado com Vite

### Variáveis de Ambiente Necessárias

**Backend:**
- `DATABASE_URL` - URL do PostgreSQL
- `MONGODB_URI` - URL do MongoDB (opcional)
- `REDIS_URL` - URL do Redis (opcional)
- `JWT_SECRET` - Chave secreta para JWT
- `JWT_EXPIRES_IN` - Tempo de expiração do JWT (ex: `7d`)
- `CORS_ORIGIN` - URL do frontend para CORS
- `PORT` - Porta do servidor (padrão: 3000)
- `NODE_ENV` - Ambiente (production)

**Frontend:**
- `VITE_API_URL` - URL da API do backend
- `VITE_WS_URL` - URL do WebSocket do backend

---

## 🚀 Como Usar

1. **Fly.io (Backend):**
   - Use `backend/Dockerfile.fly`
   - Cole o conteúdo na interface do Fly.io

2. **Render.com (Backend):**
   - Use `backend/Dockerfile`
   - Configure no `render.yaml` ou na interface

3. **Vercel/Netlify (Frontend):**
   - Geralmente não precisa de Dockerfile
   - Use build command: `npm run build`
   - Publish directory: `dist`

4. **Render.com (Frontend):**
   - Use `frontend/Dockerfile`
   - Configure como serviço web

---

## ✅ Checklist de Deploy

- [ ] Dockerfile do backend copiado e configurado
- [ ] Dockerfile do frontend copiado e configurado (se necessário)
- [ ] Variáveis de ambiente configuradas
- [ ] Banco de dados PostgreSQL criado e conectado
- [ ] CORS configurado corretamente
- [ ] Health check funcionando
- [ ] Testes de conexão realizados

---

**Última atualização:** 2024-12-31

