# ============================================
# SCRIPT DE LIMPEZA TOTAL DO CACHE
# ============================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "🧹 LIMPANDO CACHE DO FRONTEND" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. Parar o frontend
Write-Host "1️⃣  Parando container frontend..." -ForegroundColor White
docker-compose stop frontend 2>$null

# 2. Remover o container
Write-Host "2️⃣  Removendo container..." -ForegroundColor White
docker-compose rm -f frontend 2>$null

# 3. Remover a imagem
Write-Host "3️⃣  Removendo imagem antiga..." -ForegroundColor White
docker rmi yugioh-frontend 2>$null

# 4. Limpar cache do Docker
Write-Host "4️⃣  Limpando cache do Docker..." -ForegroundColor White
docker builder prune -f 2>$null

# 5. Reconstruir TOTALMENTE o frontend
Write-Host "`n5️⃣  Reconstruindo frontend do ZERO (sem cache)..." -ForegroundColor Yellow
docker-compose build --no-cache frontend

# 6. Iniciar o frontend
Write-Host "`n6️⃣  Iniciando frontend..." -ForegroundColor White
docker-compose up -d frontend

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "✅ LIMPEZA COMPLETA FINALIZADA!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

# Aguardar o Vite iniciar
Write-Host "⏳ Aguardando Vite iniciar (10s)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Mostrar logs
Write-Host "`n📋 LOGS DO FRONTEND:" -ForegroundColor Cyan
docker logs yugioh-frontend --tail 30

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "🎯 PRÓXIMOS PASSOS:" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "1️⃣  Abra: http://localhost:5173" -ForegroundColor White
Write-Host "2️⃣  Pressione: Ctrl + Shift + R (hard refresh)" -ForegroundColor White
Write-Host "3️⃣  Ou abra DevTools (F12) e:" -ForegroundColor White
Write-Host "    -> Clique com botão direito no reload" -ForegroundColor Gray
Write-Host "    -> Selecione 'Empty Cache and Hard Reload'" -ForegroundColor Gray
Write-Host "4️⃣  Faça login: admin2 / 123456" -ForegroundColor White
Write-Host "5️⃣  Clique em 'Painel Admin'" -ForegroundColor White
Write-Host "6️⃣  Clique no card '🎴 Gerenciar Cartas'" -ForegroundColor White
Write-Host "7️⃣  Deve ir para: /admin/cartas ✅" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan
