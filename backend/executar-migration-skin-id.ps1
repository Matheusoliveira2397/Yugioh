# Script PowerShell para executar migration de skinId
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Executando Migration: Adicionar skinId" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se o container Docker existe
$containerExists = docker ps -a --filter "name=yugioh-postgres" --format "{{.Names}}"
if (-not $containerExists) {
    Write-Host "ERRO: Container yugioh-postgres nao encontrado!" -ForegroundColor Red
    Write-Host "Certifique-se de que o Docker esta rodando e o container existe." -ForegroundColor Yellow
    Read-Host "Pressione ENTER para sair"
    exit 1
}

Write-Host "[1/3] Verificando se o container esta rodando..." -ForegroundColor Yellow
$containerRunning = docker ps --filter "name=yugioh-postgres" --format "{{.Names}}"
if (-not $containerRunning) {
    Write-Host "Container nao esta rodando. Iniciando..." -ForegroundColor Yellow
    docker start yugioh-postgres
    Start-Sleep -Seconds 3
}

Write-Host "[2/3] Executando migration SQL..." -ForegroundColor Yellow
$migrationPath = Join-Path $PSScriptRoot "migrations\add-skin-id-to-cards.sql"

if (-not (Test-Path $migrationPath)) {
    Write-Host "ERRO: Arquivo de migration nao encontrado: $migrationPath" -ForegroundColor Red
    Read-Host "Pressione ENTER para sair"
    exit 1
}

# Executar migration
$migrationContent = Get-Content $migrationPath -Raw
docker exec -i yugioh-postgres psql -U yugioh_user -d yugioh_db -c $migrationContent

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "Migration executada com sucesso!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verificando se a coluna foi criada..." -ForegroundColor Yellow
    docker exec -i yugioh-postgres psql -U yugioh_user -d yugioh_db -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'cards' AND column_name = 'skinId';"
} else {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Red
    Write-Host "ERRO ao executar migration!" -ForegroundColor Red
    Write-Host "============================================" -ForegroundColor Red
    Write-Host "Verifique os logs acima para mais detalhes." -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Pressione ENTER para sair"

