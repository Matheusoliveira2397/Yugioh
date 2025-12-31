# Script para verificar e fazer push
$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "VERIFICACAO E PUSH DO GIT" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar remote
Write-Host "[1/6] Verificando remote..." -ForegroundColor Yellow
$remote = git remote get-url origin 2>&1
Write-Host "Remote: $remote" -ForegroundColor Gray
Write-Host ""

# 2. Verificar branch
Write-Host "[2/6] Verificando branch..." -ForegroundColor Yellow
$branch = git branch --show-current 2>&1
Write-Host "Branch atual: $branch" -ForegroundColor Gray
Write-Host ""

# 3. Verificar status
Write-Host "[3/6] Verificando mudancas..." -ForegroundColor Yellow
$status = git status --porcelain 2>&1
if ($status) {
    Write-Host "Mudancas encontradas:" -ForegroundColor Green
    Write-Host $status -ForegroundColor White
} else {
    Write-Host "Nenhuma mudanca pendente" -ForegroundColor Yellow
}
Write-Host ""

# 4. Adicionar mudancas
Write-Host "[4/6] Adicionando mudancas..." -ForegroundColor Yellow
git add -A 2>&1 | Out-Null
$statusAfter = git status --porcelain 2>&1
if ($statusAfter) {
    Write-Host "Mudancas adicionadas:" -ForegroundColor Green
    Write-Host $statusAfter -ForegroundColor White
} else {
    Write-Host "Nada para adicionar" -ForegroundColor Yellow
}
Write-Host ""

# 5. Criar commit
Write-Host "[5/6] Criando commit..." -ForegroundColor Yellow
$commitOutput = git commit -m "chore: limpeza completa - removidos arquivos desnecessarios" 2>&1
Write-Host $commitOutput -ForegroundColor White
if ($LASTEXITCODE -eq 0) {
    Write-Host "Commit criado com sucesso!" -ForegroundColor Green
} else {
    Write-Host "Nada para commitar ou erro no commit" -ForegroundColor Yellow
}
Write-Host ""

# 6. Fazer push
Write-Host "[6/6] Fazendo push..." -ForegroundColor Yellow
$pushOutput = git push origin Developer 2>&1
Write-Host $pushOutput -ForegroundColor White
if ($LASTEXITCODE -eq 0) {
    Write-Host "Push concluido com sucesso!" -ForegroundColor Green
} else {
    Write-Host "Erro no push. Verifique autenticacao." -ForegroundColor Red
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ULTIMOS 3 COMMITS:" -ForegroundColor Cyan
git log --oneline -3 2>&1
Write-Host "========================================" -ForegroundColor Cyan
