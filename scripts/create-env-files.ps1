# Script para criar arquivos .env de exemplo
# Execute este script para criar os templates de configuração

Write-Host "📝 Criando arquivos .env de exemplo..." -ForegroundColor Cyan

# Backend .env.example
$backendEnv = @"
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
"@

# Frontend .env.example
$frontendEnv = @"
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
"@

# Frontend .env.production.example
$frontendProdEnv = @"
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
"@

# Backend .env.production.example
$backendProdEnv = @"
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
"@

# Criar arquivos
try {
    # Backend
    $backendEnv | Set-Content -Path "backend\.env.example" -Encoding UTF8
    Write-Host "✅ Criado: backend/.env.example" -ForegroundColor Green
    
    $backendProdEnv | Set-Content -Path "backend\.env.production.example" -Encoding UTF8
    Write-Host "✅ Criado: backend/.env.production.example" -ForegroundColor Green
    
    # Frontend
    $frontendEnv | Set-Content -Path "frontend\.env.example" -Encoding UTF8
    Write-Host "✅ Criado: frontend/.env.example" -ForegroundColor Green
    
    $frontendProdEnv | Set-Content -Path "frontend\.env.production.example" -Encoding UTF8
    Write-Host "✅ Criado: frontend/.env.production.example" -ForegroundColor Green
    
    Write-Host "`n✨ Todos os arquivos foram criados com sucesso!" -ForegroundColor Cyan
    Write-Host "`n📋 Próximos passos:" -ForegroundColor Yellow
    Write-Host "1. Copie backend/.env.example para backend/.env e configure" -ForegroundColor White
    Write-Host "2. Copie frontend/.env.example para frontend/.env.local e configure" -ForegroundColor White
    Write-Host "3. Para produção, use os arquivos .production.example" -ForegroundColor White
} catch {
    Write-Host "❌ Erro ao criar arquivos: $_" -ForegroundColor Red
}

