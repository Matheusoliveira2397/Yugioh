# Script simples para restaurar backup no Supabase usando Docker
# Uso: .\restore-supabase-simples.ps1 -SupabaseUser "postgres.xxxxxx" -SupabasePassword "senha"

param(
    [Parameter(Mandatory=$true)]
    [string]$SupabaseUser,
    
    [Parameter(Mandatory=$true)]
    [string]$SupabasePassword,
    
    [Parameter(Mandatory=$false)]
    [string]$BackupFile = "yugioh_backup_*.dump"
)

Write-Host "Restore: Backup -> Supabase" -ForegroundColor Cyan
Write-Host ""

# Encontrar arquivo de backup
$currentDir = Get-Location
Write-Host "Procurando backup em: $currentDir" -ForegroundColor Gray

$backupFiles = Get-ChildItem -Path $BackupFile -ErrorAction SilentlyContinue
if ($backupFiles.Count -eq 0) {
    Write-Host "ERRO: Arquivo de backup nao encontrado: $BackupFile" -ForegroundColor Red
    Write-Host "Arquivos .dump encontrados:" -ForegroundColor Yellow
    Get-ChildItem -Path "*.dump" -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  - $($_.Name)" }
    exit 1
}

$backupFileObj = $backupFiles | Select-Object -First 1
$backupFullPath = $backupFileObj.FullName
$backupDir = $backupFileObj.DirectoryName
$backupName = $backupFileObj.Name

Write-Host "Backup encontrado: $backupName" -ForegroundColor Green
Write-Host "Caminho completo: $backupFullPath" -ForegroundColor Gray
Write-Host "Executando restore..." -ForegroundColor Yellow
Write-Host ""

# Converter caminho Windows para formato Docker (C:\Users\... -> /c/Users/...)
# Docker Desktop no Windows precisa do formato Linux
$dockerPath = $backupDir -replace '^([A-Z]):', '/$1' -replace '\\', '/' -replace ':', ''

# Executar restore usando volume mount
$env:PGPASSWORD = $SupabasePassword

Write-Host "Montando volume: $dockerPath -> /backup" -ForegroundColor Gray
Write-Host "Arquivo no container: /backup/$backupName" -ForegroundColor Gray
Write-Host ""

# Verificar se arquivo existe no container antes de restaurar
Write-Host "Verificando se arquivo existe no container..." -ForegroundColor Gray
$fileCheck = docker run --rm -v "${dockerPath}:/backup:ro" postgres:16 ls -lh "/backup/$backupName" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Arquivo nao encontrado no container" -ForegroundColor Red
    Write-Host $fileCheck -ForegroundColor Red
    exit 1
}
Write-Host "OK: Arquivo encontrado no container" -ForegroundColor Green
Write-Host ""

# Executar restore usando connection string (mais confiavel)
Write-Host "Conectando ao Supabase..." -ForegroundColor Yellow

# Codificar senha para URL (substituir @ por %40)
$encodedPassword = $SupabasePassword -replace '@', '%40'

# Criar connection string
$connectionString = "postgresql://$SupabaseUser`:$encodedPassword@db.apoiwxotlrxmtirgchox.supabase.co:5432/postgres?sslmode=require"

Write-Host "Executando restore..." -ForegroundColor Gray
$restoreOutput = docker run --rm `
    -v "${dockerPath}:/backup:ro" `
    postgres:16 `
    pg_restore -Fc -d "$connectionString" "/backup/$backupName" 2>&1

Write-Host $restoreOutput

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "OK: Restore concluido!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "ERRO: Falha no restore (codigo: $LASTEXITCODE)" -ForegroundColor Red
}
