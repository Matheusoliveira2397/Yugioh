# Script simples para fazer dump do PostgreSQL
# Usa variáveis de ambiente individuais ou DATABASE_URL

param(
    [string]$OutputFile = ""
)

# Gerar nome do arquivo se não fornecido
if (-not $OutputFile) {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $OutputFile = "yugioh_backup_$timestamp.sql"
}

# Tentar obter credenciais de diferentes formas
$dbUrl = $env:DATABASE_URL
$dbHost = $env:DB_HOST
$dbPort = $env:DB_PORT
$dbUser = $env:DB_USER
$dbPassword = $env:DB_PASSWORD
$dbName = $env:DB_NAME

# Se não tem DATABASE_URL, tentar construir a partir de variáveis individuais
if (-not $dbUrl) {
    if ($dbHost -and $dbPort -and $dbUser -and $dbPassword -and $dbName) {
        $dbUrl = "postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}"
    } else {
        Write-Host "Erro: Credenciais do banco nao encontradas" -ForegroundColor Red
        Write-Host "Configure uma das opcoes:" -ForegroundColor Yellow
        Write-Host "  1. DATABASE_URL='postgresql://usuario:senha@host:porta/database'" -ForegroundColor Yellow
        Write-Host "  2. Ou configure: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "Fazendo dump do banco de dados..." -ForegroundColor Cyan
Write-Host "Arquivo: $OutputFile" -ForegroundColor Cyan

# Verificar pg_dump
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    Write-Host "Erro: pg_dump nao encontrado. Instale PostgreSQL client tools." -ForegroundColor Red
    exit 1
}

# Fazer dump
try {
    pg_dump "$dbUrl" --no-owner --no-acl --clean --if-exists -f "$OutputFile"
    
    if ($LASTEXITCODE -eq 0) {
        $file = Get-Item $OutputFile
        $sizeMB = [math]::Round($file.Length / 1MB, 2)
        Write-Host "Dump criado com sucesso!" -ForegroundColor Green
        Write-Host "Arquivo: $OutputFile" -ForegroundColor Green
        Write-Host "Tamanho: $sizeMB MB" -ForegroundColor Green
    } else {
        Write-Host "Erro ao fazer dump" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Dump concluido!" -ForegroundColor Green
