# Script para subir alterações ao Git
# Se der erro de index.lock, feche o Cursor/VS Code e remova manualmente: Remove-Item .git\index.lock -Force

Set-Location $PSScriptRoot

# Remover lock se existir (pode falhar se outro processo estiver usando)
if (Test-Path .git\index.lock) {
    try {
        Remove-Item .git\index.lock -Force
        Write-Host "Arquivo index.lock removido."
    } catch {
        Write-Host "AVISO: Nao foi possivel remover .git\index.lock. Feche o Cursor e tente de novo, ou remova manualmente." -ForegroundColor Yellow
        exit 1
    }
}

git add -A
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git commit -m "Loja: destaque, preco promocional no modal, seletor quantidade, imagem no modal carta. Admin: add carta na mao no duelo, deck inicial e skin padrao ao criar conta admin."
if ($LASTEXITCODE -ne 0) {
    Write-Host "Nada para commitar ou commit falhou." -ForegroundColor Yellow
    exit $LASTEXITCODE
}

git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "Push falhou. Verifique sua autenticacao (usuario GitHub + token)." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Concluido: alteracoes enviadas ao remoto." -ForegroundColor Green
