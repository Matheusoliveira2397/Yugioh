# Dev leve no Windows: Docker só com DB + backend; Vite no host com Node 20 do nvm.
# NÃO altera o Node padrão do sistema (não chama "nvm use").
#
# Uso (na raiz do projeto):
#   .\scripts\dev-lite.ps1
#   .\scripts\dev-lite.ps1 -SkipFrontend

param(
  [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

# Node só do jogo: caminho absoluto no nvm (padrão do PC continua 16.x)
$GameNodeVersion = "20.11.0"
$NvmHome = if ($env:NVM_HOME) { $env:NVM_HOME } else { Join-Path $env:APPDATA "nvm" }
$GameNodeDir = Join-Path $NvmHome "v$GameNodeVersion"
$GameNode = Join-Path $GameNodeDir "node.exe"
$GameNpm = Join-Path $GameNodeDir "npm.cmd"

if (-not (Test-Path $GameNode)) {
  Write-Error @"
Node $GameNodeVersion nao encontrado em:
  $GameNodeDir

Instale sem trocar o padrao do sistema:
  nvm install $GameNodeVersion
(nao rode 'nvm use' — o script chama esse node pelo caminho.)
"@
}

# PATH só nesta sessão do script: npm/vite usam o 20 sem "nvm use"
$env:Path = "$GameNodeDir;" + $env:Path

Write-Host "==> Node do jogo: $(& $GameNode -v)  ($GameNode)" -ForegroundColor DarkGray
Write-Host "==> Node padrao do sistema nao sera alterado (sem nvm use)." -ForegroundColor DarkGray

Write-Host "==> Parando containers pesados (frontend / nginx / adminer)..." -ForegroundColor Cyan
docker stop yugioh-frontend yugioh-nginx yugioh-adminer 2>$null | Out-Null
docker rm yugioh-frontend yugioh-nginx yugioh-adminer 2>$null | Out-Null

Write-Host "==> Subindo stack lite (postgres + mongodb + redis + backend)..." -ForegroundColor Cyan
docker compose up -d postgres mongodb redis backend

if ($SkipFrontend) {
  Write-Host ""
  Write-Host "Stack lite no ar." -ForegroundColor Green
  Write-Host "Frontend: .\scripts\frontend-dev.ps1" -ForegroundColor Green
  Write-Host "API: http://localhost:3000" -ForegroundColor Green
  exit 0
}

$FrontendDir = Join-Path $Root "frontend"
if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
  Write-Host "==> Instalando deps do frontend (com Node $GameNodeVersion)..." -ForegroundColor Cyan
  Push-Location $FrontendDir
  & $GameNpm install
  if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
  Pop-Location
}

$ViteJs = Join-Path $FrontendDir "node_modules\vite\bin\vite.js"
Write-Host "==> Iniciando Vite no host em http://127.0.0.1:5173 ..." -ForegroundColor Cyan
Write-Host "    Ctrl+C para parar o frontend. Docker continua rodando." -ForegroundColor DarkGray
Push-Location $FrontendDir
& $GameNode $ViteJs --host 127.0.0.1 --port 5173
$exit = $LASTEXITCODE
Pop-Location
exit $exit
