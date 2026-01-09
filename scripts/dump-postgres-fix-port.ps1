# Script para fazer dump corrigindo a porta automaticamente
# Tenta porta 5432 (padrão PostgreSQL) se a configurada falhar

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

if (-not (Test-Path $EnvFile)) {
    Write-Host "Erro: Arquivo $EnvFile nao encontrado" -ForegroundColor Red
    exit 1
}

# Ler DATABASE_URL
$dbUrl = $null
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*DATABASE_URL\s*=\s*(.+)$') {
        $dbUrl = $matches[1].Trim()
    }
}

if (-not $dbUrl) {
    Write-Host "Erro: DATABASE_URL nao encontrada no .env" -ForegroundColor Red
    exit 1
}

# Verificar se porta é 8080 e tentar corrigir para 5432
$originalUrl = $dbUrl
if ($dbUrl -match ':8080/') {
    Write-Host "Aviso: DATABASE_URL usa porta 8080, tentando corrigir para 5432..." -ForegroundColor Yellow
    $dbUrl = $dbUrl -replace ':8080/', ':5432/'
    Write-Host "URL corrigida (mascarada): $($dbUrl -replace '://([^:]+):([^@]+)@', '://$1:***@')" -ForegroundColor Green
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

Write-Host ""
Write-Host "Fazendo dump do banco de dados..." -ForegroundColor Cyan
Write-Host "Arquivo: $OutputFile" -ForegroundColor Cyan
Write-Host ""

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
        Write-Host "Localizacao completa: $($file.FullName)" -ForegroundColor Green
        
        # Sugerir atualizar .env se usou porta diferente
        if ($originalUrl -match ':8080/' -and $dbUrl -match ':5432/') {
            Write-Host ""
            Write-Host "Sugestao: Atualize a DATABASE_URL no backend\.env para usar a porta 5432" -ForegroundColor Yellow
            Write-Host "  De: $($originalUrl -replace '://([^:]+):([^@]+)@', '://$1:***@')" -ForegroundColor Red
            Write-Host "  Para: $($dbUrl -replace '://([^:]+):([^@]+)@', '://$1:***@')" -ForegroundColor Green
        }
    } else {
        Write-Host ""
        Write-Host "Erro ao fazer dump" -ForegroundColor Red
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


