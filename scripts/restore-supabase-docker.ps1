# Script PowerShell para restaurar backup no Supabase usando Docker
# Uso: .\restore-supabase-docker.ps1

param(
    [Parameter(Mandatory=$false)]
    [string]$BackupFile = "yugioh_backup_*.dump",
    
    [Parameter(Mandatory=$false)]
    [string]$SupabaseHost = "aws-0-sa-east-1.pooler.supabase.com",
    
    [Parameter(Mandatory=$false)]
    [int]$SupabasePort = 6543,
    
    [Parameter(Mandatory=$false)]
    [string]$SupabaseUser = "postgres.xxxxxx",  # Substitua pelo seu ID
    
    [Parameter(Mandatory=$false)]
    [string]$SupabaseDb = "postgres",
    
    [Parameter(Mandatory=$true)]
    [string]$SupabasePassword
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Restore: Backup -> Supabase (via Docker)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se Docker está rodando
Write-Host "[1/5] Verificando Docker..." -ForegroundColor Yellow
try {
    docker ps | Out-Null
    Write-Host "OK: Docker esta rodando" -ForegroundColor Green
} catch {
    Write-Host "ERRO: Docker nao esta rodando!" -ForegroundColor Red
    Write-Host "Inicie o Docker Desktop e tente novamente." -ForegroundColor Red
    exit 1
}

# Encontrar arquivo de backup
Write-Host ""
Write-Host "[2/5] Procurando arquivo de backup..." -ForegroundColor Yellow
$backupFiles = Get-ChildItem -Path $BackupFile -ErrorAction SilentlyContinue
if ($backupFiles.Count -eq 0) {
    Write-Host "ERRO: Arquivo de backup nao encontrado: $BackupFile" -ForegroundColor Red
    Write-Host "Arquivos .dump disponíveis:" -ForegroundColor Yellow
    Get-ChildItem -Path "*.dump" | ForEach-Object { Write-Host "  - $($_.Name)" }
    exit 1
}

$backupFile = $backupFiles | Select-Object -First 1
Write-Host "OK: Backup encontrado: $($backupFile.Name) ($([math]::Round($backupFile.Length / 1MB, 2)) MB)" -ForegroundColor Green

# Criar container temporário
Write-Host ""
Write-Host "[3/5] Criando container temporário..." -ForegroundColor Yellow
$containerName = "pg-restore-temp-$(Get-Random)"
try {
    docker run -d --name $containerName -e POSTGRES_PASSWORD=temp postgres:16 | Out-Null
    Write-Host "OK: Container criado: $containerName" -ForegroundColor Green
} catch {
    Write-Host "ERRO: Falha ao criar container" -ForegroundColor Red
    exit 1
}

# Aguardar container estar pronto
Start-Sleep -Seconds 5

# Copiar backup para container
Write-Host ""
Write-Host "[4/5] Copiando backup para container..." -ForegroundColor Yellow
Write-Host "Arquivo: $($backupFile.FullName)" -ForegroundColor Gray

# Tentar copiar
$copyOutput = docker cp "$($backupFile.FullName)" "${containerName}:/backup.dump" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Falha ao copiar backup" -ForegroundColor Red
    Write-Host $copyOutput -ForegroundColor Red
    docker rm -f $containerName | Out-Null
    exit 1
}

# Verificar se arquivo existe no container
Start-Sleep -Seconds 2
Write-Host "Verificando arquivo no container..." -ForegroundColor Gray
$fileCheck = docker exec $containerName sh -c "test -f /backup.dump && echo 'OK' || echo 'NOT_FOUND'" 2>&1
if ($fileCheck -notmatch "OK") {
    Write-Host "ERRO: Arquivo nao encontrado no container apos copia" -ForegroundColor Red
    Write-Host "Tentando listar arquivos no container..." -ForegroundColor Yellow
    docker exec $containerName ls -la / 2>&1 | Out-Host
    docker rm -f $containerName | Out-Null
    exit 1
}
Write-Host "OK: Backup copiado e verificado" -ForegroundColor Green

# Executar restore
Write-Host ""
Write-Host "[5/5] Executando restore no Supabase..." -ForegroundColor Yellow
Write-Host "Isso pode levar alguns minutos..." -ForegroundColor Gray
Write-Host ""

try {
    $env:PGPASSWORD = $SupabasePassword
    docker exec -i $containerName env PGPASSWORD=$SupabasePassword pg_restore -Fc -h $SupabaseHost -p $SupabasePort -U $SupabaseUser -d $SupabaseDb /backup.dump
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "OK: Restore concluido com sucesso!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Proximos passos:" -ForegroundColor Cyan
        Write-Host "1. Va no Supabase > Database > Table Editor" -ForegroundColor White
        Write-Host "2. Verifique se os dados foram importados" -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "ERRO durante o restore (codigo: $LASTEXITCODE)" -ForegroundColor Red
        Write-Host "Verifique os logs acima para mais detalhes." -ForegroundColor Yellow
    }
} catch {
    Write-Host ""
    Write-Host "ERRO: Falha ao executar restore" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
    # Limpar container
    Write-Host ""
    Write-Host "Limpando container temporário..." -ForegroundColor Gray
    docker rm -f $containerName | Out-Null
    Write-Host "OK: Limpeza concluida" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
