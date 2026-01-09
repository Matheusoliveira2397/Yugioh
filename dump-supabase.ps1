# Script para fazer dump do Supabase
# Uso: .\dump-supabase.ps1

param(
    [Parameter(Mandatory=$false)]
    [string]$ConnectionString = "",
    
    [Parameter(Mandatory=$false)]
    [string]$OutputFile = ""
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Dump do Banco Supabase" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Se não forneceu connection string, pedir
if (-not $ConnectionString) {
    Write-Host "Por favor, forneca a connection string do Supabase:" -ForegroundColor Yellow
    Write-Host "1. Acesse: https://supabase.com/dashboard" -ForegroundColor White
    Write-Host "2. Settings > Database > Connection string" -ForegroundColor White
    Write-Host "3. Escolha 'Direct connection' (porta 5432)" -ForegroundColor White
    Write-Host "4. Copie a connection string completa" -ForegroundColor White
    Write-Host ""
    $ConnectionString = Read-Host "Cole a connection string aqui (substitua [YOUR-PASSWORD] pela senha real)"
}

# Validar connection string
if (-not $ConnectionString -or $ConnectionString -notmatch "postgresql://") {
    Write-Host "Erro: Connection string invalida" -ForegroundColor Red
    Write-Host "Formato esperado: postgresql://postgres.xxxxx:SENHA@db.xxxxx.supabase.co:5432/postgres" -ForegroundColor Yellow
    exit 1
}

# Gerar nome do arquivo se não fornecido
if (-not $OutputFile) {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $OutputFile = "yugioh_backup_$timestamp.sql"
}

Write-Host "Fazendo dump do banco de dados..." -ForegroundColor Yellow
Write-Host "Arquivo de saida: $OutputFile" -ForegroundColor Cyan
Write-Host ""

# Extrair senha da connection string para usar no Docker
if ($ConnectionString -match "postgresql://[^:]+:([^@]+)@") {
    $password = $matches[1]
} else {
    Write-Host "Erro: Nao foi possivel extrair a senha da connection string" -ForegroundColor Red
    exit 1
}

# Fazer dump usando Docker
Write-Host "Executando dump via Docker..." -ForegroundColor Yellow
try {
    $dumpOutput = docker run --rm `
        -e PGPASSWORD="$password" `
        postgres:16 `
        pg_dump "$ConnectionString" `
        --no-owner `
        --no-acl `
        --clean `
        --if-exists `
        2>&1
    
    # Salvar output em arquivo
    $dumpOutput | Out-File -FilePath $OutputFile -Encoding UTF8
    
    if ($LASTEXITCODE -eq 0) {
        $file = Get-Item $OutputFile
        $sizeMB = [math]::Round($file.Length / 1MB, 2)
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "Dump criado com sucesso!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "Arquivo: $($file.FullName)" -ForegroundColor Green
        Write-Host "Tamanho: $sizeMB MB" -ForegroundColor Green
        Write-Host ""
        Write-Host "Proximos passos:" -ForegroundColor Cyan
        Write-Host "1. Use este arquivo para restaurar em outro banco" -ForegroundColor White
        Write-Host "2. Ou faça backup deste arquivo" -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "Erro ao fazer dump" -ForegroundColor Red
        Write-Host "Verifique a connection string e tente novamente" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Output do erro:" -ForegroundColor Red
        Write-Host $dumpOutput -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Dump concluido!" -ForegroundColor Green

