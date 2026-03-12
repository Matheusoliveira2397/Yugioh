# Setup do ambiente local igual a producao (staging)
# Uso: .\setup-staging.ps1
# - Cria .env a partir de .env.staging.example se .env nao existir
# - Sobe os containers com docker compose -f docker-compose.staging.yml

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

if (-not (Test-Path "$root\.env")) {
    if (Test-Path "$root\.env.staging.example") {
        Copy-Item "$root\.env.staging.example" "$root\.env"
        Write-Host "Criado .env a partir de .env.staging.example. Ajuste PROJECT_PATH no .env se precisar (ex.: D:/Yugioh)." -ForegroundColor Green
    } else {
        Write-Host "Arquivo .env.staging.example nao encontrado. Crie .env manualmente." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host ".env ja existe. Usando o existente." -ForegroundColor Cyan
}

Write-Host "Subindo ambiente staging (igual producao)..." -ForegroundColor Cyan
Set-Location $root
docker compose -f docker-compose.staging.yml up --build
