# 🚀 Deploy Completo - Yu-Gi-Oh! Online
# Script automatizado para Windows PowerShell

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  🎮 Yu-Gi-Oh! Online - Deploy Automático" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se está na pasta correta
if (-not (Test-Path "docker-compose.yml")) {
    Write-Host "❌ Erro: Execute este script na raiz do projeto Yugioh" -ForegroundColor Red
    exit 1
}

# Etapa 1: Preparar para produção
Write-Host "📦 Etapa 1/5: Preparando builds de produção..." -ForegroundColor Cyan
Write-Host ""

if (Test-Path "prepare-production.ps1") {
    .\prepare-production.ps1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erro ao preparar para produção" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⚠️  prepare-production.ps1 não encontrado, pulando..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Builds preparados!" -ForegroundColor Green
Start-Sleep -Seconds 2

# Etapa 2: Verificar Git
Write-Host ""
Write-Host "🔍 Etapa 2/5: Verificando repositório Git..." -ForegroundColor Cyan
Write-Host ""

$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "📝 Arquivos modificados detectados:" -ForegroundColor Yellow
    git status --short
    Write-Host ""
    
    $commit = Read-Host "Deseja fazer commit das mudanças? (s/n)"
    if ($commit -eq "s" -or $commit -eq "S") {
        Write-Host ""
        Write-Host "💬 Digite a mensagem do commit (ou deixe vazio para mensagem padrão):"
        $message = Read-Host "Mensagem"
        
        if (-not $message) {
            $message = "deploy: Production deployment $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
        }
        
        Write-Host ""
        Write-Host "📤 Fazendo commit e push..." -ForegroundColor Cyan
        git add .
        git commit -m $message
        git push origin main
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Push realizado com sucesso!" -ForegroundColor Green
        } else {
            Write-Host "❌ Erro ao fazer push" -ForegroundColor Red
            Write-Host "⚠️  Continuando mesmo assim..." -ForegroundColor Yellow
        }
    } else {
        Write-Host "⏭️  Pulando commit..." -ForegroundColor Yellow
    }
} else {
    Write-Host "✅ Repositório Git está atualizado!" -ForegroundColor Green
}

Start-Sleep -Seconds 2

# Etapa 3: Deploy Frontend (Vercel)
Write-Host ""
Write-Host "☁️  Etapa 3/5: Deploy do Frontend (Vercel)..." -ForegroundColor Cyan
Write-Host ""

# Verificar se vercel CLI está instalado
$vercelInstalled = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercelInstalled) {
    Write-Host "⚠️  Vercel CLI não encontrado" -ForegroundColor Yellow
    $install = Read-Host "Deseja instalar? (s/n)"
    if ($install -eq "s" -or $install -eq "S") {
        npm install -g vercel
    } else {
        Write-Host "⏭️  Pulando deploy do Vercel..." -ForegroundColor Yellow
        Write-Host "💡 Instale depois com: npm install -g vercel" -ForegroundColor Cyan
        $skipVercel = $true
    }
}

if (-not $skipVercel) {
    Write-Host "🔐 Fazendo login no Vercel..." -ForegroundColor Cyan
    vercel login
    
    Write-Host ""
    Write-Host "🚀 Iniciando deploy de produção..." -ForegroundColor Cyan
    Set-Location frontend
    
    $vercelDeploy = Read-Host "Fazer deploy agora? (s/n)"
    if ($vercelDeploy -eq "s" -or $vercelDeploy -eq "S") {
        vercel --prod
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Frontend deployado com sucesso!" -ForegroundColor Green
            Write-Host "📋 Copie a URL do Vercel para configurar no Railway" -ForegroundColor Yellow
        } else {
            Write-Host "❌ Erro ao fazer deploy no Vercel" -ForegroundColor Red
        }
    } else {
        Write-Host "⏭️  Pulando deploy no Vercel..." -ForegroundColor Yellow
        Write-Host "💡 Deploy depois com: cd frontend && vercel --prod" -ForegroundColor Cyan
    }
    
    Set-Location ..
}

Start-Sleep -Seconds 2

# Etapa 4: Instruções para Railway
Write-Host ""
Write-Host "🚂 Etapa 4/5: Deploy do Backend (Railway)..." -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  O deploy do Railway é via interface web:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1️⃣  Acesse: https://railway.app/dashboard" -ForegroundColor White
Write-Host "2️⃣  Clique em 'New Project' → 'Deploy from GitHub'" -ForegroundColor White
Write-Host "3️⃣  Selecione o repositório: Matheusoliveira2397/Yugioh" -ForegroundColor White
Write-Host "4️⃣  Railway detectará automaticamente o railway.json" -ForegroundColor White
Write-Host ""
Write-Host "5️⃣  Adicionar Databases:" -ForegroundColor Cyan
Write-Host "    - PostgreSQL (New → Database → PostgreSQL)" -ForegroundColor White
Write-Host "    - MongoDB (New → Database → MongoDB)" -ForegroundColor White
Write-Host "    - Redis (New → Database → Redis)" -ForegroundColor White
Write-Host ""
Write-Host "6️⃣  Configurar Variáveis de Ambiente no Backend:" -ForegroundColor Cyan
Write-Host "    NODE_ENV=production" -ForegroundColor White
Write-Host "    PORT=3000" -ForegroundColor White
Write-Host "    JWT_SECRET=<gere-um-secret-aleatorio>" -ForegroundColor White
Write-Host "    CORS_ORIGIN=https://seu-app.vercel.app" -ForegroundColor White
    Write-Host "    DATABASE_URL=" -NoNewline -ForegroundColor White
Write-Host "`${{Postgres.DATABASE_URL}}" -ForegroundColor Yellow
Write-Host "    MONGO_URI=" -NoNewline -ForegroundColor White
Write-Host "`${{MongoDB.MONGO_URL}}" -ForegroundColor Yellow
Write-Host "    REDIS_URL=" -NoNewline -ForegroundColor White
Write-Host "`${{Redis.REDIS_URL}}" -ForegroundColor Yellow
Write-Host ""

$openRailway = Read-Host "Deseja abrir Railway no navegador? (s/n)"
if ($openRailway -eq "s" -or $openRailway -eq "S") {
    Start-Process "https://railway.app/dashboard"
}

Write-Host ""
Read-Host "Pressione ENTER após concluir o deploy no Railway"

# Etapa 5: Conectar Frontend e Backend
Write-Host ""
Write-Host "🔗 Etapa 5/5: Conectando Frontend e Backend..." -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Anote as URLs:" -ForegroundColor Yellow
Write-Host ""
$backendUrl = Read-Host "URL do backend Railway (ex: https://seu-backend.railway.app)"
$frontendUrl = Read-Host "URL do frontend Vercel (ex: https://seu-app.vercel.app)"

Write-Host ""
Write-Host "⚙️  Configuração necessária:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1️⃣  No Vercel:" -ForegroundColor White
Write-Host "    Settings → Environment Variables → Add" -ForegroundColor Gray
Write-Host "    VITE_API_URL = $backendUrl" -ForegroundColor Yellow
Write-Host "    VITE_WS_URL = $backendUrl" -ForegroundColor Yellow
Write-Host "    Depois: Deployments → Redeploy" -ForegroundColor Gray
Write-Host ""
Write-Host "2️⃣  No Railway:" -ForegroundColor White
Write-Host "    Backend → Variables → Update" -ForegroundColor Gray
Write-Host "    CORS_ORIGIN = $frontendUrl" -ForegroundColor Yellow
Write-Host "    FRONTEND_URL = $frontendUrl" -ForegroundColor Yellow
Write-Host "    (Redeploy automático)" -ForegroundColor Gray
Write-Host ""

$openVercel = Read-Host "Deseja abrir Vercel no navegador? (s/n)"
if ($openVercel -eq "s" -or $openVercel -eq "S") {
    Start-Process "https://vercel.com/dashboard"
}

# Finalização
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  ✅ Deploy Iniciado com Sucesso!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Próximos Passos:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Configure as variáveis de ambiente no Vercel" -ForegroundColor White
Write-Host "2. Configure as variáveis de ambiente no Railway" -ForegroundColor White
Write-Host "3. Aguarde o deploy finalizar (~5 minutos)" -ForegroundColor White
Write-Host "4. Teste o health check: $backendUrl/health" -ForegroundColor White
Write-Host "5. Acesse seu jogo: $frontendUrl" -ForegroundColor White
Write-Host ""
Write-Host "📚 Documentação:" -ForegroundColor Cyan
Write-Host "   - POST_DEPLOY_GUIDE.md (Validação completa)" -ForegroundColor Gray
Write-Host "   - DEPLOY_SCRIPTS.md (Comandos de deploy)" -ForegroundColor Gray
Write-Host "   - DEPLOY_GUIDE.md (Guia detalhado)" -ForegroundColor Gray
Write-Host ""
Write-Host "💡 Dica: Execute os testes de validação do POST_DEPLOY_GUIDE.md" -ForegroundColor Yellow
Write-Host ""
Write-Host "🎮 Boa sorte com seu jogo! 🌟" -ForegroundColor Magenta
Write-Host ""

# Perguntar se quer abrir o guia de pós-deploy
$openGuide = Read-Host "Deseja abrir o POST_DEPLOY_GUIDE.md? (s/n)"
if ($openGuide -eq "s" -or $openGuide -eq "S") {
    code POST_DEPLOY_GUIDE.md
}

Write-Host ""
Write-Host "✨ Script finalizado! ✨" -ForegroundColor Green
