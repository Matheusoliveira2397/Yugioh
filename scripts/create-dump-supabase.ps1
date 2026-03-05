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

# Gerar dump DENTRO do container e copiar para fora (evita pipe no PowerShell truncar/corromper o dump)
# --inserts: gera INSERT em vez de COPY, assim o restore funciona via pooler do Supabase (sem erro "backslash restricted")
$dumpInsideContainer = "/tmp/dump-supabase.sql"
Write-Host "Criando dump no container (formato INSERT para Supabase pooler)..." -ForegroundColor Cyan
docker exec $containerName pg_dump -U $dbUser --no-owner --no-acl -F p --inserts $dbName -f $dumpInsideContainer
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao executar pg_dump." -ForegroundColor Red
    exit 1
}

Write-Host "Copiando dump para $projectRoot\$dumpFile ..." -ForegroundColor Cyan
docker cp "${containerName}:${dumpInsideContainer}" $dumpFile
docker exec $containerName rm -f $dumpInsideContainer 2>$null

if (-not (Test-Path $dumpFile) -or (Get-Item $dumpFile).Length -eq 0) {
    Write-Host "Erro: dump vazio ou nao criado." -ForegroundColor Red
    exit 1
}

# Ajustes para Supabase: remover \restrict (rejeitado pelo pooler) e trocar uuid_generate_v4 por gen_random_uuid (built-in PG13+)
Write-Host "Ajustando dump para Supabase (uuid + remover \\restrict)..." -ForegroundColor Cyan
$content = Get-Content $dumpFile -Raw -Encoding UTF8
$content = $content -replace 'public\.uuid_generate_v4\(\)', 'gen_random_uuid()'
$content = $content -replace '(?m)^\\restrict[^\r\n]*[\r\n]+', ''
[System.IO.File]::WriteAllText("$projectRoot\$dumpFile", $content, [System.Text.UTF8Encoding]::new($false))

$sizeMb = [math]::Round((Get-Item $dumpFile).Length / 1MB, 2)
Write-Host "Tamanho do dump: $sizeMb MB" -ForegroundColor Gray

Write-Host "Dump criado: $projectRoot\$dumpFile" -ForegroundColor Green
Write-Host "Proximo passo: Supabase -> SQL Editor -> cole o conteudo de dump-supabase.sql e execute." -ForegroundColor Yellow
