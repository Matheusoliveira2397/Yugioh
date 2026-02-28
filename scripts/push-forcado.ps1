$ErrorActionPreference = "Stop"
# Ir para a raiz do projeto (funciona em C: ou D:)
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot

Write-Host "=== INICIANDO PUSH ===" -ForegroundColor Cyan

# Verificar se estamos no diretorio correto
$pwd = Get-Location
Write-Host "Diretorio: $pwd" -ForegroundColor Gray

# Verificar remote
Write-Host "`n[1] Verificando remote..." -ForegroundColor Yellow
$remote = & git remote get-url origin
Write-Host "Remote: $remote" -ForegroundColor White

# Verificar branch
Write-Host "`n[2] Verificando branch..." -ForegroundColor Yellow
$branch = & git branch --show-current
Write-Host "Branch: $branch" -ForegroundColor White

# Status antes
Write-Host "`n[3] Status antes do add..." -ForegroundColor Yellow
$statusBefore = & git status --porcelain
if ($statusBefore) {
    Write-Host "Mudancas encontradas:" -ForegroundColor Green
    $statusBefore | ForEach-Object { Write-Host "  $_" -ForegroundColor White }
} else {
    Write-Host "Nenhuma mudanca pendente" -ForegroundColor Yellow
}

# Adicionar tudo
Write-Host "`n[4] Adicionando todas as mudancas..." -ForegroundColor Yellow
& git add -A
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO ao adicionar!" -ForegroundColor Red
    exit 1
}
Write-Host "OK" -ForegroundColor Green

# Status depois
Write-Host "`n[5] Status depois do add..." -ForegroundColor Yellow
$statusAfter = & git status --porcelain
if ($statusAfter) {
    Write-Host "Mudancas para commitar:" -ForegroundColor Green
    $statusAfter | ForEach-Object { Write-Host "  $_" -ForegroundColor White }
} else {
    Write-Host "Nada para commitar" -ForegroundColor Yellow
    Write-Host "Tentando adicionar delecoes explicitamente..." -ForegroundColor Yellow
    & git add -u
    $statusAfter2 = & git status --porcelain
    if ($statusAfter2) {
        Write-Host "Mudancas encontradas apos add -u:" -ForegroundColor Green
        $statusAfter2 | ForEach-Object { Write-Host "  $_" -ForegroundColor White }
    }
}

# Commit
Write-Host "`n[6] Criando commit..." -ForegroundColor Yellow
$commitMsg = "chore: limpeza completa - removidos arquivos desnecessarios, guias duplicados e scripts de teste"
$commitOutput = & git commit -m $commitMsg 2>&1
Write-Host $commitOutput -ForegroundColor White

if ($LASTEXITCODE -eq 0) {
    Write-Host "Commit criado!" -ForegroundColor Green
} else {
    Write-Host "Nada para commitar ou erro" -ForegroundColor Yellow
}

# Ver commits locais
Write-Host "`n[7] Verificando commits locais nao enviados..." -ForegroundColor Yellow
$localCommits = & git log origin/Developer..HEAD --oneline 2>&1
if ($localCommits) {
    Write-Host "Commits locais:" -ForegroundColor Green
    $localCommits | ForEach-Object { Write-Host "  $_" -ForegroundColor White }
} else {
    Write-Host "Nenhum commit local nao enviado" -ForegroundColor Yellow
}

# Push
Write-Host "`n[8] Fazendo push..." -ForegroundColor Yellow
$pushOutput = & git push origin Developer 2>&1
Write-Host $pushOutput -ForegroundColor White

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=== PUSH CONCLUIDO COM SUCESSO ===" -ForegroundColor Green
} else {
    Write-Host "`n=== ERRO NO PUSH ===" -ForegroundColor Red
    Write-Host "Verifique autenticacao ou conexao" -ForegroundColor Yellow
}

# Ultimo commit
Write-Host "`n[9] Ultimo commit:" -ForegroundColor Yellow
$lastCommit = & git log --oneline -1
Write-Host $lastCommit -ForegroundColor White

Write-Host "`n=== FIM ===" -ForegroundColor Cyan
