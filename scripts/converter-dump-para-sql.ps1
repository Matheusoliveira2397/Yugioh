# Script simples para converter dump para SQL
# Uso: .\converter-dump-para-sql.ps1

param(
    [Parameter(Mandatory=$false)]
    [string]$DumpFile = "yugioh_backup_*.dump"
)

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Converter Dump para SQL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Encontrar dump
$dumpFiles = Get-ChildItem -Path $DumpFile -ErrorAction SilentlyContinue
if ($dumpFiles.Count -eq 0) {
    Write-Host "ERRO: Dump nao encontrado: $DumpFile" -ForegroundColor Red
    Get-ChildItem -Filter "*.dump" | ForEach-Object { Write-Host "  - $($_.Name)" }
    exit 1
}

$dumpFile = $dumpFiles | Select-Object -First 1
Write-Host "Dump encontrado: $($dumpFile.Name)" -ForegroundColor Green
Write-Host "Tamanho: $([math]::Round($dumpFile.Length / 1MB, 2)) MB" -ForegroundColor Gray
Write-Host ""

# Preparar caminhos
$dumpPath = $dumpFile.FullName
$sqlFile = $dumpPath -replace '\.dump$', '.sql'
$dockerPath = "/backup/" + $dumpFile.Name

Write-Host "Arquivo SQL sera: $sqlFile" -ForegroundColor Yellow
Write-Host ""

# Verificar Docker
Write-Host "Verificando Docker..." -ForegroundColor Yellow
try {
    docker ps | Out-Null
    Write-Host "OK: Docker esta rodando" -ForegroundColor Green
} catch {
    Write-Host "ERRO: Docker nao esta rodando!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Converter
Write-Host "Convertendo dump para SQL..." -ForegroundColor Yellow
Write-Host "Isso pode levar alguns minutos dependendo do tamanho..." -ForegroundColor Gray
Write-Host ""

$convertOutput = docker run --rm `
    -v "${PWD}:/backup" `
    postgres:16 `
    pg_restore -Fc -f "/backup/$($dumpFile.BaseName).sql" "/backup/$($dumpFile.Name)" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "OK: Conversao concluida!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Arquivo SQL criado: $($dumpFile.BaseName).sql" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "PROXIMOS PASSOS:" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Acesse: https://supabase.com/dashboard" -ForegroundColor White
    Write-Host "2. Selecione seu projeto" -ForegroundColor White
    Write-Host "3. Va em SQL Editor" -ForegroundColor White
    Write-Host "4. Clique em New Query" -ForegroundColor White
    Write-Host "5. Abra o arquivo: $($dumpFile.BaseName).sql" -ForegroundColor Yellow
    Write-Host "6. Execute o SQL (pode dividir em partes se for muito grande)" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "ERRO: Falha na conversao" -ForegroundColor Red
    Write-Host $convertOutput -ForegroundColor Red
    Write-Host ""
    Write-Host "Tentando metodo alternativo..." -ForegroundColor Yellow
    
    # Metodo alternativo: usar pg_restore com formato plain
    $altOutput = docker run --rm `
        -v "${PWD}:/backup" `
        postgres:16 `
        pg_restore -Fc --no-owner --no-acl -f "/backup/$($dumpFile.BaseName)_alt.sql" "/backup/$($dumpFile.Name)" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK: Conversao alternativa concluida!" -ForegroundColor Green
        Write-Host "Arquivo: $($dumpFile.BaseName)_alt.sql" -ForegroundColor Cyan
    } else {
        Write-Host "ERRO: Conversao alternativa tambem falhou" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
