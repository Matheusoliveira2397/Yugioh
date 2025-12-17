# Script para fazer commit e push de todas as mudanças
Write-Host "=== GIT STATUS ===" -ForegroundColor Cyan
git status

Write-Host "`n=== ADICIONANDO TODAS AS MUDANCAS ===" -ForegroundColor Yellow
git add -A

Write-Host "`n=== STATUS APOS ADD ===" -ForegroundColor Cyan
git status --short

Write-Host "`n=== CRIANDO COMMIT ===" -ForegroundColor Yellow
$commitMsg = "chore: limpeza completa - removidos arquivos desnecessarios, guias duplicados e scripts de teste"
git commit -m $commitMsg

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=== COMMIT CRIADO COM SUCESSO ===" -ForegroundColor Green
} else {
    Write-Host "`n=== NENHUMA MUDANCA PARA COMMITAR ===" -ForegroundColor Yellow
}

Write-Host "`n=== FAZENDO PUSH ===" -ForegroundColor Yellow
git push origin Developer

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=== PUSH CONCLUIDO COM SUCESSO ===" -ForegroundColor Green
} else {
    Write-Host "`n=== ERRO NO PUSH ===" -ForegroundColor Red
    Write-Host "Verifique se ha commits locais nao enviados:" -ForegroundColor Yellow
    git log origin/Developer..HEAD --oneline
}

Write-Host "`n=== ULTIMOS 3 COMMITS ===" -ForegroundColor Cyan
git log --oneline -3
