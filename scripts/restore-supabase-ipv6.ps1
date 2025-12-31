# Script para restaurar backup no Supabase com suporte IPv6
# Tenta varias abordagens automaticamente

param(
    [Parameter(Mandatory=$false)]
    [string]$BackupFile = "yugioh_backup_*.dump",
    
    [Parameter(Mandatory=$false)]
    [string]$SupabaseHost = "db.apoiwxotlrxmtirgchox.supabase.co",
    
    [Parameter(Mandatory=$false)]
    [int]$SupabasePort = 5432,
    
    [Parameter(Mandatory=$false)]
    [string]$SupabaseUser = "postgres",
    
    [Parameter(Mandatory=$false)]
    [string]$SupabaseDb = "postgres",
    
    [Parameter(Mandatory=$true)]
    [string]$SupabasePassword
)

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Restore Supabase (IPv6-Compatible)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Encontrar backup
Write-Host "[1/6] Procurando backup..." -ForegroundColor Yellow
$backupFiles = Get-ChildItem -Path $BackupFile -ErrorAction SilentlyContinue
if ($backupFiles.Count -eq 0) {
    Write-Host "ERRO: Backup nao encontrado: $BackupFile" -ForegroundColor Red
    exit 1
}
$backupFile = $backupFiles | Select-Object -First 1
Write-Host "OK: $($backupFile.Name)" -ForegroundColor Green
Write-Host ""

# 2. Verificar Docker
Write-Host "[2/6] Verificando Docker..." -ForegroundColor Yellow
try {
    docker ps | Out-Null
    Write-Host "OK: Docker esta rodando" -ForegroundColor Green
} catch {
    Write-Host "ERRO: Docker nao esta rodando!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 3. Testar conexao
Write-Host "[3/6] Testando conexao com Supabase..." -ForegroundColor Yellow
try {
    $testConnection = Test-NetConnection -ComputerName $SupabaseHost -Port $SupabasePort -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
    if ($testConnection.TcpTestSucceeded) {
        Write-Host "OK: Conexao IPv4 funcionando" -ForegroundColor Green
        $useIPv4 = $true
    } else {
        Write-Host "AVISO: Conexao IPv4 falhou, tentando IPv6..." -ForegroundColor Yellow
        $useIPv4 = $false
    }
} catch {
    Write-Host "AVISO: Nao foi possivel testar conexao" -ForegroundColor Yellow
    $useIPv4 = $false
}
Write-Host ""

# 4. Preparar caminho Docker
Write-Host "[4/6] Preparando ambiente..." -ForegroundColor Yellow
$backupPath = $backupFile.FullName
$dockerPath = $backupPath -replace '^([A-Z]):', '/$1' -replace '\\', '/'
$dockerPath = $dockerPath.ToLower()
Write-Host "Caminho local: $backupPath" -ForegroundColor Gray
Write-Host "Caminho Docker: $dockerPath" -ForegroundColor Gray
Write-Host ""

# 5. Tentar restore direto (IPv4 ou IPv6)
Write-Host "[5/6] Tentando restore direto..." -ForegroundColor Yellow
$encodedPassword = $SupabasePassword -replace '@', '%40'
$connectionString = "postgresql://$SupabaseUser`:$encodedPassword@$SupabaseHost`:$SupabasePort/$SupabaseDb?sslmode=require"

Write-Host "Executando pg_restore..." -ForegroundColor Gray
$restoreOutput = docker run --rm `
    -v "${backupPath}:${dockerPath}:ro" `
    --network host `
    postgres:16 `
    pg_restore -Fc -v -d "$connectionString" "$dockerPath" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "OK: Restore concluido com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Proximos passos:" -ForegroundColor Cyan
    Write-Host "1. Va no Supabase > Database > Table Editor" -ForegroundColor White
    Write-Host "2. Verifique se os dados foram importados" -ForegroundColor White
    exit 0
} else {
    Write-Host ""
    Write-Host "AVISO: Restore direto falhou (codigo: $LASTEXITCODE)" -ForegroundColor Yellow
    Write-Host "Tentando converter para SQL..." -ForegroundColor Yellow
    Write-Host ""
}

# 6. Converter para SQL (fallback)
Write-Host "[6/6] Convertendo dump para SQL..." -ForegroundColor Yellow
$sqlFile = $backupFile.FullName -replace '\.dump$', '.sql'
Write-Host "Arquivo SQL: $sqlFile" -ForegroundColor Gray

Write-Host "Convertendo (isso pode levar alguns minutos)..." -ForegroundColor Gray
$convertOutput = docker run --rm `
    -v "${backupPath}:${dockerPath}:ro" `
    -v "${PWD}:/output" `
    postgres:16 `
    pg_restore -Fc -f "/output/$($backupFile.BaseName).sql" "$dockerPath" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "OK: Conversao concluida!" -ForegroundColor Green
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "PROXIMOS PASSOS:" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Acesse o Supabase Dashboard" -ForegroundColor White
    Write-Host "2. Va em SQL Editor" -ForegroundColor White
    Write-Host "3. Abra o arquivo: $($backupFile.BaseName).sql" -ForegroundColor Yellow
    Write-Host "4. Execute o SQL (pode dividir em partes se for muito grande)" -ForegroundColor White
    Write-Host ""
    Write-Host "OU use o script: importar-sql-supabase.ps1" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "ERRO: Falha na conversao" -ForegroundColor Red
    Write-Host $convertOutput -ForegroundColor Red
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
