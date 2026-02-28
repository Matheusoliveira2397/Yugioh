# Script para debugar o salvamento de cartas
# Uso: .\scripts\debug-card-save.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Debug: Salvamento de Cartas" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar volumes mapeados
Write-Host "[1/5] Verificando volumes mapeados..." -ForegroundColor Yellow
$mounts = docker inspect yugioh-backend --format '{{json .Mounts}}' | ConvertFrom-Json
$frontendCardsMount = $mounts | Where-Object { $_.Destination -like '*frontend-cards*' -or $_.Destination -like '*cards*' }
if ($frontendCardsMount) {
    Write-Host "✅ Volume encontrado:" -ForegroundColor Green
    Write-Host "   Source (Servidor): $($frontendCardsMount.Source)" -ForegroundColor Gray
    Write-Host "   Destination (Container): $($frontendCardsMount.Destination)" -ForegroundColor Gray
    Write-Host ""
    
    # Verificar se a pasta existe no servidor
    if (Test-Path $frontendCardsMount.Source) {
        Write-Host "   ✅ Pasta existe no servidor" -ForegroundColor Green
        $files = Get-ChildItem -Path $frontendCardsMount.Source -ErrorAction SilentlyContinue
        Write-Host "   Arquivos encontrados: $($files.Count)" -ForegroundColor Gray
        if ($files.Count -gt 0) {
            Write-Host "   Primeiros 5 arquivos:" -ForegroundColor Gray
            $files | Select-Object -First 5 | ForEach-Object { Write-Host "     - $($_.Name) ($([math]::Round($_.Length/1KB, 2)) KB)" -ForegroundColor Gray }
        }
    } else {
        Write-Host "   ❌ Pasta NÃO existe no servidor" -ForegroundColor Red
    }
} else {
    Write-Host "❌ Volume para frontend-cards NÃO encontrado!" -ForegroundColor Red
    Write-Host "   Todos os volumes:" -ForegroundColor Gray
    $mounts | ForEach-Object { Write-Host "     - $($_.Destination) -> $($_.Source)" -ForegroundColor Gray }
}
Write-Host ""

# 2. Verificar no container
Write-Host "[2/5] Verificando no container..." -ForegroundColor Yellow
$containerCheck = docker exec yugioh-backend sh -c "test -d /app/frontend-cards && echo 'EXISTS' || echo 'NOT_EXISTS'" 2>&1
if ($containerCheck -match "EXISTS") {
    Write-Host "✅ Pasta /app/frontend-cards existe no container" -ForegroundColor Green
    $cardCount = docker exec yugioh-backend sh -c "ls -1 /app/frontend-cards 2>/dev/null | wc -l" 2>&1
    Write-Host "   Arquivos no container: $cardCount" -ForegroundColor Gray
    if ([int]$cardCount -gt 0) {
        Write-Host "   Primeiros 5 arquivos:" -ForegroundColor Gray
        docker exec yugioh-backend sh -c "ls -1 /app/frontend-cards | head -5" 2>&1 | ForEach-Object { Write-Host "     - $_" -ForegroundColor Gray }
    }
} else {
    Write-Host "❌ Pasta /app/frontend-cards NÃO existe no container" -ForegroundColor Red
}
Write-Host ""

# 3. Verificar logs recentes do backend
Write-Host "[3/5] Verificando logs recentes do backend..." -ForegroundColor Yellow
$logs = docker logs yugioh-backend --tail 50 2>&1 | Select-String -Pattern "cardImage|frontend-cards|Imagem salva|downloadAndSaveCardImage|uploadCardImage" -Context 1
if ($logs) {
    Write-Host "✅ Logs encontrados:" -ForegroundColor Green
    $logs | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
} else {
    Write-Host "⚠️ Nenhum log relacionado a cartas encontrado" -ForegroundColor Yellow
}
Write-Host ""

# 4. Verificar variável de ambiente
Write-Host "[4/5] Verificando variável de ambiente FRONTEND_CARDS_PATH..." -ForegroundColor Yellow
$envCheck = docker exec yugioh-backend sh -c "echo \$FRONTEND_CARDS_PATH" 2>&1
if ($envCheck -and $envCheck -ne "") {
    Write-Host "✅ FRONTEND_CARDS_PATH definida: $envCheck" -ForegroundColor Green
} else {
    Write-Host "⚠️ FRONTEND_CARDS_PATH não está definida (usando detecção automática)" -ForegroundColor Yellow
}
Write-Host ""

# 5. Verificar permissões
Write-Host "[5/5] Verificando permissões..." -ForegroundColor Yellow
if ($frontendCardsMount -and (Test-Path $frontendCardsMount.Source)) {
    $acl = Get-Acl $frontendCardsMount.Source -ErrorAction SilentlyContinue
    if ($acl) {
        Write-Host "✅ Permissões da pasta:" -ForegroundColor Green
        $acl.Access | Select-Object -First 3 | ForEach-Object { Write-Host "   $($_.IdentityReference): $($_.FileSystemRights)" -ForegroundColor Gray }
    } else {
        Write-Host "⚠️ Não foi possível verificar permissões" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️ Não é possível verificar permissões (pasta não encontrada)" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Resumo" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📍 Para testar o salvamento:" -ForegroundColor Yellow
Write-Host "   1. Abra o painel admin de cartas" -ForegroundColor Gray
Write-Host "   2. Baixe uma imagem de uma carta" -ForegroundColor Gray
Write-Host "   3. Salve a carta" -ForegroundColor Gray
Write-Host "   4. Execute este script novamente para verificar" -ForegroundColor Gray
Write-Host ""
Write-Host "📍 Para ver logs em tempo real:" -ForegroundColor Yellow
Write-Host "   docker logs -f yugioh-backend | Select-String -Pattern 'cardImage|frontend-cards'" -ForegroundColor Gray
Write-Host ""


