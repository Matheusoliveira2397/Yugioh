# Script para debug e fazer dump do PostgreSQL
# Mostra informações de conexão (sem senha) antes de fazer dump

param(
    [string]$OutputFile = "",
    [string]$EnvFile = "backend\.env"
)

# Gerar nome do arquivo se não fornecido
if (-not $OutputFile) {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $OutputFile = "yugioh_backup_$timestamp.sql"
}

Write-Host "=== Debug: Informacoes de Conexao ===" -ForegroundColor Cyan

# Ler arquivo .env
if (-not (Test-Path $EnvFile)) {
    Write-Host "Erro: Arquivo $EnvFile nao encontrado" -ForegroundColor Red
    exit 1
}

$dbUrl = $null
$dbHost = $null
$dbPort = $null
$dbUser = $null
$dbPassword = $null
$dbName = $null

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*DATABASE_URL\s*=\s*(.+)$') {
        $dbUrl = $matches[1].Trim()
        $masked = $dbUrl -replace '://([^:]+):([^@]+)@', '://$1:***@'
        Write-Host "DATABASE_URL (mascarada): $masked" -ForegroundColor Yellow
    }
    elseif ($_ -match '^\s*DB_HOST\s*=\s*(.+)$') {
        $dbHost = $matches[1].Trim()
        Write-Host "DB_HOST: $dbHost" -ForegroundColor Yellow
    }
    elseif ($_ -match '^\s*DB_PORT\s*=\s*(.+)$') {
        $dbPort = $matches[1].Trim()
        Write-Host "DB_PORT: $dbPort" -ForegroundColor Yellow
    }
    elseif ($_ -match '^\s*DB_USER\s*=\s*(.+)$') {
        $dbUser = $matches[1].Trim()
        Write-Host "DB_USER: $dbUser" -ForegroundColor Yellow
    }
    elseif ($_ -match '^\s*DB_PASSWORD\s*=\s*(.+)$') {
        $dbPassword = $matches[1].Trim()
        Write-Host "DB_PASSWORD: ***" -ForegroundColor Yellow
    }
    elseif ($_ -match '^\s*DB_NAME\s*=\s*(.+)$') {
        $dbName = $matches[1].Trim()
        Write-Host "DB_NAME: $dbName" -ForegroundColor Yellow
    }
}

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Construir DATABASE_URL se necessário
if (-not $dbUrl) {
    if ($dbHost -and $dbPort -and $dbUser -and $dbPassword -and $dbName) {
        $dbUrl = "postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}"
        Write-Host "DATABASE_URL construida a partir de variaveis individuais" -ForegroundColor Green
    } else {
        Write-Host "Erro: Credenciais incompletas" -ForegroundColor Red
        exit 1
    }
}

# Encontrar pg_dump
$pgDumpPath = $null
$pgDumpCmd = Get-Command pg_dump -ErrorAction SilentlyContinue
if ($pgDumpCmd) {
    $pgDumpPath = "pg_dump"
} else {
    $commonPaths = @(
        "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe",
        "C:\Program Files (x86)\PostgreSQL\*\bin\pg_dump.exe"
    )
    foreach ($pathPattern in $commonPaths) {
        $found = Get-ChildItem -Path $pathPattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) {
            $pgDumpPath = $found.FullName
            break
        }
    }
}

if (-not $pgDumpPath) {
    Write-Host "Erro: pg_dump nao encontrado" -ForegroundColor Red
    exit 1
}

Write-Host "Fazendo dump..." -ForegroundColor Cyan
Write-Host "Arquivo: $OutputFile" -ForegroundColor Cyan
Write-Host "pg_dump: $pgDumpPath" -ForegroundColor Cyan
Write-Host ""

# Fazer dump
try {
    & $pgDumpPath "$dbUrl" --no-owner --no-acl --clean --if-exists -f "$OutputFile"
    
    if ($LASTEXITCODE -eq 0) {
        $file = Get-Item $OutputFile
        $sizeMB = [math]::Round($file.Length / 1MB, 2)
        Write-Host ""
        Write-Host "Dump criado com sucesso!" -ForegroundColor Green
        Write-Host "Arquivo: $OutputFile" -ForegroundColor Green
        Write-Host "Tamanho: $sizeMB MB" -ForegroundColor Green
        Write-Host "Localizacao completa: $($file.FullName)" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "Erro ao fazer dump" -ForegroundColor Red
        Write-Host "Verifique:" -ForegroundColor Yellow
        Write-Host "  1. PostgreSQL esta rodando?" -ForegroundColor Yellow
        Write-Host "  2. Porta esta correta? (padrao: 5432)" -ForegroundColor Yellow
        Write-Host "  3. Credenciais estao corretas?" -ForegroundColor Yellow
        Write-Host "  4. Database existe?" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}


