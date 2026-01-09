# Script para fazer dump do PostgreSQL lendo do arquivo .env
# Uso: .\dump-postgres-from-env.ps1

param(
    [string]$OutputFile = "",
    [string]$EnvFile = "backend\.env"
)

# Gerar nome do arquivo se não fornecido
if (-not $OutputFile) {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $OutputFile = "yugioh_backup_$timestamp.sql"
}

Write-Host "Lendo configuracoes do arquivo: $EnvFile" -ForegroundColor Cyan

# Verificar se arquivo .env existe
if (-not (Test-Path $EnvFile)) {
    Write-Host "Erro: Arquivo $EnvFile nao encontrado" -ForegroundColor Red
    Write-Host "Configure a DATABASE_URL no arquivo .env ou use:" -ForegroundColor Yellow
    Write-Host "  .\dump-postgres-simple.ps1" -ForegroundColor Yellow
    exit 1
}

# Ler arquivo .env e extrair DATABASE_URL
$dbUrl = $null
$dbHost = $null
$dbPort = $null
$dbUser = $null
$dbPassword = $null
$dbName = $null

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*DATABASE_URL\s*=\s*(.+)$') {
        $dbUrl = $matches[1].Trim()
    }
    elseif ($_ -match '^\s*DB_HOST\s*=\s*(.+)$') {
        $dbHost = $matches[1].Trim()
    }
    elseif ($_ -match '^\s*DB_PORT\s*=\s*(.+)$') {
        $dbPort = $matches[1].Trim()
    }
    elseif ($_ -match '^\s*DB_USER\s*=\s*(.+)$') {
        $dbUser = $matches[1].Trim()
    }
    elseif ($_ -match '^\s*DB_PASSWORD\s*=\s*(.+)$') {
        $dbPassword = $matches[1].Trim()
    }
    elseif ($_ -match '^\s*DB_NAME\s*=\s*(.+)$') {
        $dbName = $matches[1].Trim()
    }
}

# Se não tem DATABASE_URL, tentar construir a partir de variáveis individuais
if (-not $dbUrl) {
    if ($dbHost -and $dbPort -and $dbUser -and $dbPassword -and $dbName) {
        $dbUrl = "postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}"
        Write-Host "Construindo DATABASE_URL a partir de variaveis individuais" -ForegroundColor Yellow
    } else {
        Write-Host "Erro: DATABASE_URL nao encontrada no arquivo .env" -ForegroundColor Red
        Write-Host "Configure DATABASE_URL ou as variaveis: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "Fazendo dump do banco de dados..." -ForegroundColor Cyan
Write-Host "Arquivo: $OutputFile" -ForegroundColor Cyan

# Verificar pg_dump e encontrar caminho
$pgDumpPath = $null

# Tentar encontrar no PATH primeiro
$pgDumpCmd = Get-Command pg_dump -ErrorAction SilentlyContinue
if ($pgDumpCmd) {
    $pgDumpPath = "pg_dump"
} else {
    # Procurar em locais comuns
    $commonPaths = @(
        "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe",
        "C:\Program Files (x86)\PostgreSQL\*\bin\pg_dump.exe"
    )
    
    foreach ($pathPattern in $commonPaths) {
        $found = Get-ChildItem -Path $pathPattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) {
            $pgDumpPath = $found.FullName
            Write-Host "Usando pg_dump de: $pgDumpPath" -ForegroundColor Yellow
            break
        }
    }
    
    if (-not $pgDumpPath) {
        Write-Host "Erro: pg_dump nao encontrado" -ForegroundColor Red
        Write-Host "Instale PostgreSQL client tools ou adicione ao PATH" -ForegroundColor Yellow
        exit 1
    }
}

# Fazer dump
try {
    Write-Host "Executando pg_dump..." -ForegroundColor Yellow
    & $pgDumpPath "$dbUrl" --no-owner --no-acl --clean --if-exists -f "$OutputFile"
    
    if ($LASTEXITCODE -eq 0) {
        $file = Get-Item $OutputFile
        $sizeMB = [math]::Round($file.Length / 1MB, 2)
        Write-Host ""
        Write-Host "Dump criado com sucesso!" -ForegroundColor Green
        Write-Host "Arquivo: $OutputFile" -ForegroundColor Green
        Write-Host "Tamanho: $sizeMB MB" -ForegroundColor Green
        Write-Host "Localizacao: $($file.FullName)" -ForegroundColor Green
    } else {
        Write-Host "Erro ao fazer dump (codigo: $LASTEXITCODE)" -ForegroundColor Red
        Write-Host "Verifique se:" -ForegroundColor Yellow
        Write-Host "  1. PostgreSQL esta rodando" -ForegroundColor Yellow
        Write-Host "  2. Credenciais estao corretas" -ForegroundColor Yellow
        Write-Host "  3. Database existe" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Dump concluido!" -ForegroundColor Green

