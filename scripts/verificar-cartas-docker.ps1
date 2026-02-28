# Script para verificar onde as cartas estão salvas no Docker
# Uso: .\scripts\verificar-cartas-docker.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Verificar Cartas no Docker" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se Docker está rodando
Write-Host "[1/4] Verificando Docker..." -ForegroundColor Yellow
try {
    docker ps | Out-Null
    Write-Host "OK: Docker está rodando" -ForegroundColor Green
} catch {
    Write-Host "ERRO: Docker não está rodando!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Verificar container do backend
Write-Host "[2/4] Verificando container do backend..." -ForegroundColor Yellow
$backendContainer = "yugioh-backend-prod"
if (-not (docker ps -a --format "{{.Names}}" | Select-String -Pattern $backendContainer)) {
    Write-Host "AVISO: Container $backendContainer não encontrado" -ForegroundColor Yellow
    Write-Host "Tentando encontrar outros containers do backend..." -ForegroundColor Gray
    $backendContainer = docker ps -a --format "{{.Names}}" | Select-String -Pattern "backend" | Select-Object -First 1
    if ($backendContainer) {
        Write-Host "Container encontrado: $backendContainer" -ForegroundColor Green
    } else {
        Write-Host "ERRO: Nenhum container do backend encontrado!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "OK: Container encontrado: $backendContainer" -ForegroundColor Green
}
Write-Host ""

# Verificar onde as cartas estão salvas dentro do container
Write-Host "[3/4] Verificando onde as cartas estão salvas no container..." -ForegroundColor Yellow
Write-Host ""

# Verificar /app/frontend-cards
Write-Host "Verificando /app/frontend-cards..." -ForegroundColor Gray
$frontendCardsCheck = docker exec $backendContainer sh -c "test -d /app/frontend-cards && echo 'EXISTS' || echo 'NOT_EXISTS'" 2>&1
if ($frontendCardsCheck -match "EXISTS") {
    Write-Host "✅ Pasta /app/frontend-cards existe" -ForegroundColor Green
    $cardCount = docker exec $backendContainer sh -c "ls -1 /app/frontend-cards 2>/dev/null | wc -l" 2>&1
    Write-Host "   Arquivos encontrados: $cardCount" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   Primeiros 10 arquivos:" -ForegroundColor Gray
    docker exec $backendContainer sh -c "ls -1 /app/frontend-cards | head -10" 2>&1 | ForEach-Object { Write-Host "   - $_" -ForegroundColor Gray }
} else {
    Write-Host "❌ Pasta /app/frontend-cards NÃO existe" -ForegroundColor Red
}
Write-Host ""

# Verificar /app/uploads/cards (backup)
Write-Host "Verificando /app/uploads/cards (backup)..." -ForegroundColor Gray
$backendCardsCheck = docker exec $backendContainer sh -c "test -d /app/uploads/cards && echo 'EXISTS' || echo 'NOT_EXISTS'" 2>&1
if ($backendCardsCheck -match "EXISTS") {
    Write-Host "✅ Pasta /app/uploads/cards existe" -ForegroundColor Green
    $cardCount = docker exec $backendContainer sh -c "ls -1 /app/uploads/cards 2>/dev/null | wc -l" 2>&1
    Write-Host "   Arquivos encontrados: $cardCount" -ForegroundColor Gray
} else {
    Write-Host "❌ Pasta /app/uploads/cards NÃO existe" -ForegroundColor Red
}
Write-Host ""

# Verificar volumes mapeados
Write-Host "[4/4] Verificando volumes mapeados..." -ForegroundColor Yellow
Write-Host ""
$inspectOutput = docker inspect $backendContainer --format '{{json .Mounts}}' | ConvertFrom-Json
Write-Host "Volumes mapeados no container:" -ForegroundColor Gray
foreach ($mount in $inspectOutput) {
    if ($mount.Type -eq "bind") {
        Write-Host "  📁 Bind Mount:" -ForegroundColor Cyan
        Write-Host "     Source (Servidor): $($mount.Source)" -ForegroundColor Gray
        Write-Host "     Destination (Container): $($mount.Destination)" -ForegroundColor Gray
        Write-Host ""
        
        # Verificar se a pasta existe no servidor
        if (Test-Path $mount.Source) {
            Write-Host "     ✅ Pasta existe no servidor" -ForegroundColor Green
            $files = Get-ChildItem -Path $mount.Source -ErrorAction SilentlyContinue
            Write-Host "     Arquivos no servidor: $($files.Count)" -ForegroundColor Gray
        } else {
            Write-Host "     ❌ Pasta NÃO existe no servidor" -ForegroundColor Red
        }
        Write-Host ""
    } elseif ($mount.Type -eq "volume") {
        Write-Host "  💾 Volume Nomeado:" -ForegroundColor Cyan
        Write-Host "     Name: $($mount.Name)" -ForegroundColor Gray
        Write-Host "     Destination (Container): $($mount.Destination)" -ForegroundColor Gray
        Write-Host ""
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Resumo" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📍 Para ver as cartas no servidor, verifique:" -ForegroundColor Yellow
Write-Host "   ./frontend/public/images/cards" -ForegroundColor Gray
Write-Host ""
Write-Host "📍 Para ver as cartas no container Docker:" -ForegroundColor Yellow
Write-Host "   docker exec $backendContainer ls -la /app/frontend-cards" -ForegroundColor Gray
Write-Host ""
Write-Host "📍 Para copiar cartas do container para o servidor:" -ForegroundColor Yellow
Write-Host "   docker cp $backendContainer:/app/frontend-cards ./frontend/public/images/cards" -ForegroundColor Gray
Write-Host ""


