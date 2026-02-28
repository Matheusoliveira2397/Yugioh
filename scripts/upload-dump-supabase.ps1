# Envia o dump-supabase.sql para o banco Supabase (via Docker + psql)
# Execute na pasta do projeto: .\scripts\upload-dump-supabase.ps1

$ErrorActionPreference = "Stop"
$projectRoot = if ($PSScriptRoot) { Split-Path -Parent (Split-Path -Parent $PSScriptRoot) } else { Get-Location }
if (-not (Test-Path (Join-Path $projectRoot "backend"))) { $projectRoot = Get-Location }
Set-Location $projectRoot

$dumpFile = "dump-supabase.sql"
# Session pooler (IPv4) - host aws-1-sa-east-1 do dashboard
$connectionUri = "postgresql://postgres.mantttrvvhevfjxojstn:YugiohCOD262002@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"

if (-not (Test-Path $dumpFile)) {
    Write-Host "Arquivo $dumpFile nao encontrado. Rode primeiro: .\scripts\create-dump-supabase.ps1" -ForegroundColor Red
    exit 1
}

Write-Host "Enviando dump para o Supabase..." -ForegroundColor Cyan
docker run --rm -v "${projectRoot}\${dumpFile}:/dump.sql" postgres:16-alpine psql $connectionUri -f /dump.sql

if ($LASTEXITCODE -eq 0) {
    Write-Host "Dump aplicado no Supabase com sucesso." -ForegroundColor Green
} else {
    Write-Host "Se der 'could not translate host name' ou erro de rede, use no Supabase: Connect -> Session pooler e use a nova URI neste script." -ForegroundColor Yellow
    exit 1
}
