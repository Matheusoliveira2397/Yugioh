#!/bin/bash
# Script de build para o backend
# Usado em serviços de deploy como Render.com

echo "📦 Instalando dependências..."
npm install

echo "🔨 Compilando projeto..."
npm run build

echo "✅ Build concluído!"

