# Script para criar dump do Postgres local (compatível com Supabase)
# Execute: .\scripts\create-dump-supabase.ps1

$ErrorActionPreference = "Stop"
$projectRoot = if ($PSScriptRoot) { Split-Path -Parent (Split-Path -Parent $PSScriptRoot) } else { Get-Location }
if (-not (Test-Path (Join-Path $projectRoot "backend"))) { $projectRoot = Get-Location }
Set-Location $projectRoot

$containerName = "yugioh-postgres"
$dbUser = "yugioh_user"
$dbName = "yugioh_db"
$dumpFile = "dump-supabase.sql"

Write-Host "Verificando container Postgres..." -ForegroundColor Cyan
$running = docker ps --filter "name=$containerName" --format "{{.Names}}" 2>$null
if (-not $running) {
    Write-Host "Container '$containerName' nao encontrado ou parado. Suba o Docker e tente novamente." -ForegroundColor Red
    exit 1
}

Write-Host "Criando dump em $dumpFile ..." -ForegroundColor Cyan
docker exec $containerName pg_dump -U $dbUser --no-owner --no-acl $dbName | Set-Content -Path $dumpFile -Encoding utf8

if (-not (Test-Path $dumpFile) -or (Get-Item $dumpFile).Length -eq 0) {
    Write-Host "Erro: dump vazio ou nao criado." -ForegroundColor Red
    exit 1
}

Write-Host "Dump criado: $projectRoot\$dumpFile" -ForegroundColor Green
Write-Host "Proximo passo: Supabase -> SQL Editor -> cole o conteudo de dump-supabase.sql e execute." -ForegroundColor Yellow
