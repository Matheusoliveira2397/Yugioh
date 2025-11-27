# Script para ver logs do backend de forma filtrada
# Uso: .\ver-logs-backend.ps1 [filtro]

param(
    [string]$Filtro = ""
)

if ($Filtro -eq "") {
    Write-Host "📋 Ver logs do backend (filtrado)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Uso:" -ForegroundColor Yellow
    Write-Host "  .\ver-logs-backend.ps1              # Ver apenas erros" -ForegroundColor White
    Write-Host "  .\ver-logs-backend.ps1 'createDuel'  # Filtrar por texto" -ForegroundColor White
    Write-Host "  .\ver-logs-backend.ps1 'error'       # Ver apenas erros" -ForegroundColor White
    Write-Host ""
    Write-Host "Filtros úteis:" -ForegroundColor Yellow
    Write-Host "  'error'      - Apenas erros" -ForegroundColor White
    Write-Host "  'createDuel' - Criação de duelos" -ForegroundColor White
    Write-Host "  '✅'         - Apenas sucessos" -ForegroundColor White
    Write-Host "  '❌'         - Apenas erros" -ForegroundColor White
    Write-Host ""
    
    # Por padrão, mostrar apenas erros e sucessos importantes
    docker logs -f yugioh-backend 2>&1 | Select-String -Pattern "❌|✅.*criado|error|ERROR" -CaseSensitive:$false
} else {
    # Filtrar por texto fornecido
    docker logs -f yugioh-backend 2>&1 | Select-String -Pattern $Filtro -CaseSensitive:$false
}

