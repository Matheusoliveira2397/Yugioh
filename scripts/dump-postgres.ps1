# Script para fazer dump do PostgreSQL
# Uso: .\dump-postgres.ps1

param(
    [string]$OutputFile = "",
    [string]$DatabaseUrl = $env:DATABASE_URL
)

# Verificar se DATABASE_URL está definida
if (-not $DatabaseUrl) {
    Write-Host "❌ Erro: DATABASE_URL não está definida" -ForegroundColor Red
    Write-Host "Configure a variável de ambiente DATABASE_URL ou passe como parâmetro:" -ForegroundColor Yellow
    Write-Host "  .\dump-postgres.ps1 -DatabaseUrl 'postgresql://usuario:senha@host:porta/database'" -ForegroundColor Yellow
    exit 1
}

# Gerar nome do arquivo se não fornecido
if (-not $OutputFile) {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $OutputFile = "yugioh_backup_$timestamp.sql"
}

Write-Host "🔄 Iniciando dump do banco de dados..." -ForegroundColor Cyan
Write-Host "📁 Arquivo de saída: $OutputFile" -ForegroundColor Cyan

# Verificar se pg_dump está disponível
$pgDumpPath = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDumpPath) {
    Write-Host "❌ Erro: pg_dump não encontrado" -ForegroundColor Red
    Write-Host "Instale o PostgreSQL client tools ou adicione ao PATH" -ForegroundColor Yellow
    exit 1
}

try {
    # Fazer dump usando DATABASE_URL
    Write-Host "📦 Fazendo dump..." -ForegroundColor Yellow
    
    # Usar pg_dump com DATABASE_URL
    $env:PGPASSWORD = ""  # Limpar senha anterior se houver
    pg_dump "$DatabaseUrl" --no-owner --no-acl --clean --if-exists -f "$OutputFile"
    
    if ($LASTEXITCODE -eq 0) {
        $fileSize = (Get-Item $OutputFile).Length / 1MB
        Write-Host "✅ Dump criado com sucesso!" -ForegroundColor Green
        Write-Host "📁 Arquivo: $OutputFile" -ForegroundColor Green
        Write-Host "📊 Tamanho: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Green
        
        # Perguntar se quer comprimir
        $compress = Read-Host "Deseja comprimir o arquivo? (s/n)"
        if ($compress -eq "s" -or $compress -eq "S") {
            $compressedFile = "$OutputFile.gz"
            Write-Host "🗜️ Comprimindo..." -ForegroundColor Yellow
            Compress-Archive -Path $OutputFile -DestinationPath $compressedFile -Force
            Remove-Item $OutputFile
            $compressedSize = (Get-Item $compressedFile).Length / 1MB
            Write-Host "✅ Arquivo comprimido: $compressedFile ($([math]::Round($compressedSize, 2)) MB)" -ForegroundColor Green
        }
    } else {
        Write-Host "❌ Erro ao fazer dump" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Erro: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ Dump concluído!" -ForegroundColor Green


