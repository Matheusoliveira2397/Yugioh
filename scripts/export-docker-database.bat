@echo off
REM Script para exportar banco de dados do Docker
REM Uso: export-docker-database.bat

echo ========================================
echo Exportando banco de dados do Docker
echo ========================================
echo.

REM Verificar se Docker está rodando
docker ps >nul 2>&1
if errorlevel 1 (
    echo ERRO: Docker nao esta rodando!
    echo Inicie o Docker e tente novamente.
    pause
    exit /b 1
)

echo [1/3] Verificando container...
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
echo.

REM Valores do docker-compose.yml
set CONTAINER_NAME=yugioh-postgres
set DB_USER=yugioh_user
set DB_NAME=yugioh_db

echo [2/3] Criando backup...
echo Container: %CONTAINER_NAME%
echo Usuario: %DB_USER%
echo Banco: %DB_NAME%
echo.

REM Criar backup
docker exec -t %CONTAINER_NAME% pg_dump -U %DB_USER% -Fc %DB_NAME% > yugioh_backup_%date:~-4,4%%date:~-7,2%%date:~-10,2%_%time:~0,2%%time:~3,2%%time:~6,2%.dump

if errorlevel 1 (
    echo.
    echo ERRO: Falha ao criar backup!
    echo Verifique se o container esta rodando: docker ps
    pause
    exit /b 1
)

echo.
echo [3/3] Backup criado com sucesso!
echo.
echo Arquivo: yugioh_backup_*.dump
echo.
echo Proximo passo: Importar no Supabase usando pg_restore
echo.
pause
