#!/bin/bash

echo "🚀 Preparando projeto para produção..."

# 1. Limpar dependências
echo "📦 Limpando node_modules..."
rm -rf frontend/node_modules backend/node_modules

# 2. Instalar dependências do frontend
echo "📦 Instalando dependências do frontend..."
cd frontend
npm install
cd ..

# 3. Instalar dependências do backend
echo "📦 Instalando dependências do backend..."
cd backend
npm install
cd ..

# 4. Build do frontend
echo "🔨 Compilando frontend..."
cd frontend
npm run build
cd ..

# 5. Build do backend
echo "🔨 Compilando backend..."
cd backend
npm run build
cd ..

echo "✅ Projeto pronto para produção!"
echo ""
echo "📋 Próximos passos:"
echo "1. Commit e push para GitHub"
echo "2. Deploy frontend no Vercel: cd frontend && vercel --prod"
echo "3. Deploy backend no Railway: conecte seu repositório GitHub"
echo ""
echo "Para mais informações, leia DEPLOY_QUICKSTART.md"
