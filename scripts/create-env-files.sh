#!/bin/bash

# Script para criar arquivos .env de exemplo
# Execute este script para criar os templates de configuração

echo "📝 Criando arquivos .env de exemplo..."

# Backend .env.example
cat > backend/.env.example << 'EOF'
# ============================================
# CONFIGURAÇÃO DO SERVIDOR
# ============================================
PORT=3000
NODE_ENV=production

# ============================================
# CORS - IMPORTANTE PARA DEPLOY SEPARADO
# ============================================
# URL do frontend (sem trailing slash)
CORS_ORIGIN=https://seu-frontend.com

# ============================================
# BANCO DE DADOS POSTGRESQL
# ============================================
DATABASE_URL=postgresql://usuario:senha@host:5432/yugioh

# ============================================
# BANCO DE DADOS MONGODB (Opcional)
# ============================================
MONGODB_URI=mongodb://localhost:27017/yugioh-chat

# ============================================
# REDIS (Opcional)
# ============================================
REDIS_URL=redis://localhost:6379

# ============================================
# JWT - AUTENTICAÇÃO
# ============================================
# Gere uma chave: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=sua-chave-secreta-super-forte-aqui
JWT_EXPIRES_IN=7d

# ============================================
# UPLOAD DE ARQUIVOS
# ============================================
MAX_FILE_SIZE=10485760

# ============================================
# CONFIGURAÇÕES ADICIONAIS
# ============================================
HTTP_TIMEOUT=30000
MAX_CONNECTIONS=2000
LOG_LEVEL=info
EOF

# Backend .env.production.example
cat > backend/.env.production.example << 'EOF'
# ============================================
# CONFIGURAÇÃO DO BACKEND - PRODUÇÃO
# ============================================
NODE_ENV=production
PORT=3000

# ============================================
# CORS - CRÍTICO PARA DEPLOY SEPARADO
# ============================================
# URL exata do seu frontend (com https://)
CORS_ORIGIN=https://app.seudominio.com

# ============================================
# BANCO DE DADOS POSTGRESQL
# ============================================
DATABASE_URL=postgresql://usuario:senha@host:5432/yugioh

# ============================================
# MONGODB (Opcional)
# ============================================
MONGODB_URI=mongodb://host:27017/yugioh-chat

# ============================================
# REDIS (Opcional)
# ============================================
REDIS_URL=redis://host:6379

# ============================================
# JWT - SEGURANÇA CRÍTICA
# ============================================
# Gere uma chave forte e única!
JWT_SECRET=SUA-CHAVE-SECRETA-SUPER-FORTE-AQUI-GERE-UMA-NOVA
JWT_EXPIRES_IN=7d
EOF

# Frontend .env.example
cat > frontend/.env.example << 'EOF'
# ============================================
# CONFIGURAÇÃO DO FRONTEND
# ============================================
# URL da API do backend
VITE_API_URL=http://localhost:3000

# ============================================
# WEBSOCKET (Opcional)
# ============================================
# Se não especificado, usa VITE_API_URL
# Use wss:// para HTTPS em produção
VITE_WS_URL=

# ============================================
# CONFIGURAÇÕES ADICIONAIS
# ============================================
VITE_DEV_MODE=false
EOF

# Frontend .env.production.example
cat > frontend/.env.production.example << 'EOF'
# ============================================
# CONFIGURAÇÃO DO FRONTEND - PRODUÇÃO
# ============================================
# URL da API do backend (HTTPS obrigatório)
VITE_API_URL=https://api.seudominio.com

# ============================================
# WEBSOCKET - PRODUÇÃO
# ============================================
# Use wss:// para HTTPS
VITE_WS_URL=wss://api.seudominio.com
EOF

echo "✅ Todos os arquivos foram criados com sucesso!"
echo ""
echo "📋 Próximos passos:"
echo "1. Copie backend/.env.example para backend/.env e configure"
echo "2. Copie frontend/.env.example para frontend/.env.local e configure"
echo "3. Para produção, use os arquivos .production.example"


