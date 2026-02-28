@echo off
echo ============================================
echo Executando Migration: Criar Tabela group_requests
echo ============================================
echo.

REM Verificar se o container Docker existe
docker ps -a --filter "name=yugioh-postgres" --format "{{.Names}}" | findstr /C:"yugioh-postgres" >nul
if errorlevel 1 (
    echo ERRO: Container yugioh-postgres nao encontrado!
    echo Certifique-se de que o Docker esta rodando e o container existe.
    pause
    exit /b 1
)

echo [1/3] Verificando se o container esta rodando...
docker ps --filter "name=yugioh-postgres" --format "{{.Names}}" | findstr /C:"yugioh-postgres" >nul
if errorlevel 1 (
    echo Container nao esta rodando. Iniciando...
    docker start yugioh-postgres
    timeout /t 3 /nobreak >nul
)

echo [2/3] Executando migration SQL...
set MIGRATION_PATH=src\modules\groups\migrations\create-group-requests-table.sql

if not exist "%MIGRATION_PATH%" (
    echo ERRO: Arquivo de migration nao encontrado: %MIGRATION_PATH%
    pause
    exit /b 1
)

REM Executar migration
docker exec -i yugioh-postgres psql -U yugioh_user -d yugioh_db < "%MIGRATION_PATH%"

if errorlevel 1 (
    echo.
    echo ERRO: Falha ao executar migration!
    pause
    exit /b 1
)

echo.
echo [3/3] Verificando se a tabela foi criada...
docker exec -i yugioh-postgres psql -U yugioh_user -d yugioh_db -c "SELECT table_name FROM information_schema.tables WHERE table_name = 'group_requests';"

if errorlevel 1 (
    echo.
    echo AVISO: Nao foi possivel verificar a tabela.
) else (
    echo.
    echo ============================================
    echo Migration executada com sucesso!
    echo ============================================
    echo.
    echo A tabela group_requests foi criada.
    echo O sistema de solicitacoes de entrada em cla privado esta disponivel.
)

pause

