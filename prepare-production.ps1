# PowerShell script para preparar produção no Windows

Write-Host "🚀 Preparando projeto para produção..." -ForegroundColor Cyan

# 1. Limpar dependências
Write-Host "📦 Limpando node_modules..." -ForegroundColor Yellow
if (Test-Path "frontend\node_modules") { Remove-Item -Recurse -Force "frontend\node_modules" }
if (Test-Path "backend\node_modules") { Remove-Item -Recurse -Force "backend\node_modules" }

# 2. Instalar dependências do frontend
Write-Host "📦 Instalando dependências do frontend..." -ForegroundColor Yellow
Set-Location frontend
npm install
Set-Location ..

# 3. Instalar dependências do backend
Write-Host "📦 Instalando dependências do backend..." -ForegroundColor Yellow
Set-Location backend
npm install
Set-Location ..

# 4. Build do frontend
Write-Host "🔨 Compilando frontend..." -ForegroundColor Yellow
Set-Location frontend
npm run build
Set-Location ..

# 5. Build do backend
Write-Host "🔨 Compilando backend..." -ForegroundColor Yellow
Set-Location backend
npm run build
Set-Location ..

Write-Host "✅ Projeto pronto para produção!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Próximos passos:" -ForegroundColor Cyan
Write-Host "1. Commit e push para GitHub: git add . && git commit -m 'Preparado para produção' && git push"
Write-Host "2. Deploy frontend no Vercel: cd frontend; vercel --prod"
Write-Host "3. Deploy backend no Railway: conecte seu repositório GitHub em https://railway.app"
Write-Host ""
Write-Host "Para mais informações, leia DEPLOY_QUICKSTART.md" -ForegroundColor Yellow
