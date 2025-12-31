@echo off
echo ============================================
echo Executando Migration: Adicionar skinId as cartas
echo ============================================
echo.

REM Verificar se o container Docker existe
docker ps -a | findstr "yugioh-postgres" >nul
if %errorlevel% neq 0 (
    echo ERRO: Container yugioh-postgres nao encontrado!
    echo Certifique-se de que o Docker esta rodando e o container existe.
    pause
    exit /b 1
)

echo [1/3] Verificando se o container esta rodando...
docker ps | findstr "yugioh-postgres" >nul
if %errorlevel% neq 0 (
    echo Container nao esta rodando. Iniciando...
    docker start yugioh-postgres
    timeout /t 3 >nul
)

echo [2/3] Executando migration SQL...
docker exec -i yugioh-postgres psql -U yugioh_user -d yugioh_db < migrations\add-skin-id-to-cards.sql

if %errorlevel% equ 0 (
    echo.
    echo ============================================
    echo Migration executada com sucesso!
    echo ============================================
    echo.
    echo Verificando se a coluna foi criada...
    docker exec -i yugioh-postgres psql -U yugioh_user -d yugioh_db -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'cards' AND column_name = 'skinId';"
) else (
    echo.
    echo ============================================
    echo ERRO ao executar migration!
    echo ============================================
    echo Verifique os logs acima para mais detalhes.
)

echo.
pause

