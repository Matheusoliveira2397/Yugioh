# Sobe só o Vite do jogo usando Node 20 do nvm pelo caminho absoluto.
# Não chama "nvm use" — o Node padrão do Windows (ex.: 16) permanece.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$FrontendDir = Join-Path $Root "frontend"

$GameNodeVersion = "20.11.0"
$NvmHome = if ($env:NVM_HOME) { $env:NVM_HOME } else { Join-Path $env:APPDATA "nvm" }
$GameNodeDir = Join-Path $NvmHome "v$GameNodeVersion"
$GameNode = Join-Path $GameNodeDir "node.exe"
$GameNpm = Join-Path $GameNodeDir "npm.cmd"

if (-not (Test-Path $GameNode)) {
  Write-Error "Instale com: nvm install $GameNodeVersion  (sem 'nvm use')"
}

# PATH só nesta janela — não muda o padrão global do nvm
$env:Path = "$GameNodeDir;" + $env:Path

Write-Host "Node do jogo: $(& $GameNode -v) — padrao do sistema intacto" -ForegroundColor DarkGray
Set-Location $FrontendDir
if (-not (Test-Path "node_modules")) {
  & $GameNpm install
}

$ViteJs = Join-Path $FrontendDir "node_modules\vite\bin\vite.js"
& $GameNode $ViteJs --host 127.0.0.1 --port 5173
