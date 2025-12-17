# Script para importar arquivo SQL no Supabase via API
# Divide o arquivo em partes menores para evitar timeouts

param(
    [Parameter(Mandatory=$true)]
    [string]$SqlFile,
    
    [Parameter(Mandatory=$true)]
    [string]$SupabaseUrl,
    
    [Parameter(Mandatory=$true)]
    [string]$SupabaseKey
)

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Importar SQL no Supabase via API" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar arquivo
if (-not (Test-Path $SqlFile)) {
    Write-Host "ERRO: Arquivo nao encontrado: $SqlFile" -ForegroundColor Red
    exit 1
}

Write-Host "Arquivo: $SqlFile" -ForegroundColor Gray
$fileSize = (Get-Item $SqlFile).Length / 1MB
Write-Host "Tamanho: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Gray
Write-Host ""

# Ler arquivo SQL
Write-Host "Lendo arquivo SQL..." -ForegroundColor Yellow
$sqlContent = Get-Content $SqlFile -Raw -Encoding UTF8

# Dividir em comandos (por ponto-e-virgula)
Write-Host "Dividindo em comandos..." -ForegroundColor Yellow
$commands = $sqlContent -split ';' | Where-Object { $_.Trim() -ne '' }

Write-Host "Total de comandos: $($commands.Count)" -ForegroundColor Gray
Write-Host ""

# Preparar headers
$headers = @{
    "apikey" = $SupabaseKey
    "Authorization" = "Bearer $SupabaseKey"
    "Content-Type" = "application/json"
}

# Executar comandos em lotes
$batchSize = 10
$totalBatches = [math]::Ceiling($commands.Count / $batchSize)
$successCount = 0
$errorCount = 0

Write-Host "Executando comandos em lotes de $batchSize..." -ForegroundColor Yellow
Write-Host ""

for ($i = 0; $i -lt $commands.Count; $i += $batchSize) {
    $batch = $commands[$i..($i + $batchSize - 1)]
    $batchNum = [math]::Floor($i / $batchSize) + 1
    
    Write-Host "[$batchNum/$totalBatches] Executando lote..." -ForegroundColor Cyan
    
    # Combinar comandos do lote
    $batchSql = ($batch | ForEach-Object { $_.Trim() }) -join ";" + ";"
    
    # Preparar body
    $body = @{
        query = $batchSql
    } | ConvertTo-Json
    
    try {
        # Executar via API
        $response = Invoke-RestMethod `
            -Uri "$SupabaseUrl/rest/v1/rpc/exec_sql" `
            -Method Post `
            -Headers $headers `
            -Body $body `
            -ErrorAction Stop
        
        $successCount += $batch.Count
        Write-Host "  OK: $($batch.Count) comandos executados" -ForegroundColor Green
    } catch {
        Write-Host "  ERRO: $($_.Exception.Message)" -ForegroundColor Red
        $errorCount += $batch.Count
        
        # Tentar executar comandos individualmente
        Write-Host "  Tentando executar individualmente..." -ForegroundColor Yellow
        foreach ($cmd in $batch) {
            try {
                $singleBody = @{
                    query = $cmd.Trim() + ";"
                } | ConvertTo-Json
                
                $response = Invoke-RestMethod `
                    -Uri "$SupabaseUrl/rest/v1/rpc/exec_sql" `
                    -Method Post `
                    -Headers $headers `
                    -Body $singleBody `
                    -ErrorAction Stop
                
                $successCount++
                $errorCount--
            } catch {
                Write-Host "    ERRO em comando individual: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RESUMO:" -ForegroundColor Cyan
Write-Host "  Sucesso: $successCount comandos" -ForegroundColor Green
Write-Host "  Erros: $errorCount comandos" -ForegroundColor $(if ($errorCount -eq 0) { "Green" } else { "Red" })
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($errorCount -eq 0) {
    Write-Host "OK: Importacao concluida com sucesso!" -ForegroundColor Green
} else {
    Write-Host "AVISO: Alguns comandos falharam. Verifique os logs acima." -ForegroundColor Yellow
}
