# Yu-Gi-Oh! Online - Script de Inicializacao

Write-Host "Criando arquivos .env..." -ForegroundColor Green
Copy-Item backend\.env.example backend\.env -Force
Copy-Item frontend\.env.example frontend\.env -Force
Write-Host "Arquivos .env criados!" -ForegroundColor Green

Write-Host "`nIniciando todos os servicos..." -ForegroundColor Cyan
docker-compose up --build -d

Write-Host "`nVerificando status..." -ForegroundColor Cyan
Start-Sleep -Seconds 5
docker-compose ps

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "JOGO INICIADO COM SUCESSO!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

Write-Host "Acesse em:" -ForegroundColor Cyan
Write-Host "   Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "   Backend:  http://localhost:3000" -ForegroundColor White
Write-Host "   Nginx:    http://localhost`n" -ForegroundColor White

Write-Host "COMANDOS UTEIS:" -ForegroundColor Yellow
Write-Host "   Ver logs:       docker-compose logs -f" -ForegroundColor White
Write-Host "   Parar:          docker-compose down" -ForegroundColor White
Write-Host "   Reiniciar:      docker-compose restart" -ForegroundColor White
Write-Host "   Limpar tudo:    docker-compose down -v`n" -ForegroundColor White

Write-Host "ITS TIME TO DUEL!`n" -ForegroundColor Magenta
