# Script simples para fazer dump do Supabase
# Uso: .\dump-supabase-simples.ps1 -ConnectionString "postgresql://postgres.xxxxx:SENHA@db.xxxxx.supabase.co:5432/postgres"

param(
    [Parameter(Mandatory=$true)]
    [string]$ConnectionString
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Dump do Banco Supabase" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Gerar nome do arquivo com timestamp
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$OutputFile = "yugioh_backup_$timestamp.sql"

Write-Host "Fazendo dump do banco de dados..." -ForegroundColor Yellow
Write-Host "Arquivo de saida: $OutputFile" -ForegroundColor Cyan
Write-Host ""

# Extrair senha da connection string
if ($ConnectionString -match "postgresql://[^:]+:([^@]+)@") {
    $password = $matches[1]
} else {
    Write-Host "Erro: Nao foi possivel extrair a senha da connection string" -ForegroundColor Red
    exit 1
}

# Fazer dump usando Docker
Write-Host "Executando dump via Docker..." -ForegroundColor Yellow
try {
    docker run --rm `
        -e PGPASSWORD="$password" `
        postgres:16 `
        pg_dump "$ConnectionString" `
        --no-owner `
        --no-acl `
        --clean `
        --if-exists `
        > $OutputFile 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        $file = Get-Item $OutputFile -ErrorAction SilentlyContinue
        if ($file) {
            $sizeMB = [math]::Round($file.Length / 1MB, 2)
            Write-Host ""
            Write-Host "========================================" -ForegroundColor Green
            Write-Host "Dump criado com sucesso!" -ForegroundColor Green
            Write-Host "========================================" -ForegroundColor Green
            Write-Host "Arquivo: $($file.FullName)" -ForegroundColor Green
            Write-Host "Tamanho: $sizeMB MB" -ForegroundColor Green
            Write-Host ""
            Write-Host "O arquivo esta pronto para uso!" -ForegroundColor Cyan
        } else {
            Write-Host "Aviso: Arquivo criado mas nao foi possivel verificar o tamanho" -ForegroundColor Yellow
        }
    } else {
        Write-Host ""
        Write-Host "Erro ao fazer dump" -ForegroundColor Red
        Write-Host "Verifique a connection string e tente novamente" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Ultimas linhas do erro:" -ForegroundColor Red
        Get-Content $OutputFile -Tail 10 -ErrorAction SilentlyContinue
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Dump concluido!" -ForegroundColor Green

