# Script PowerShell para Promover Usuário a Admin

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  🔐 PROMOVER USUÁRIO A ADMIN" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Cyan

# Pedir o email do usuário
$email = Read-Host "Digite o email do usuário que quer promover"

Write-Host "`n🔄 Conectando ao PostgreSQL...`n" -ForegroundColor Cyan

# Executar comando SQL via Docker
$sqlCommand = "UPDATE users SET role = 'MASTER' WHERE email = '$email'; SELECT id, nickname, email, role FROM users WHERE email = '$email';"

docker exec -it yugioh-postgres psql -U yugioh_user -d yugioh_db -c $sqlCommand

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Usuário promovido a MASTER com sucesso!" -ForegroundColor Green
    Write-Host "`n💡 Agora faça:" -ForegroundColor Yellow
    Write-Host "   1. Deslogue e logue novamente no jogo" -ForegroundColor White
    Write-Host "   2. Tente criar a carta novamente`n" -ForegroundColor White
} else {
    Write-Host "`n❌ Erro ao promover usuário" -ForegroundColor Red
    Write-Host "⚠️  Certifique-se de que o Docker está rodando!" -ForegroundColor Yellow
    Write-Host "   Execute: docker-compose up -d`n" -ForegroundColor Gray
}

Write-Host "========================================`n" -ForegroundColor Cyan
