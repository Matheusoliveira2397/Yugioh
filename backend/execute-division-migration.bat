@echo off
echo Executando migration para adicionar coluna division na tabela users...
echo.

REM Ajuste estas variáveis conforme seu ambiente
set DB_HOST=localhost
set DB_PORT=5432
set DB_NAME=yugioh_db
set DB_USER=yugioh_user
set DB_PASSWORD=yugioh_password

REM Executar migration
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f migrations\add-division-to-users.sql

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Migration executada com sucesso!
    echo A coluna division foi adicionada na tabela users.
) else (
    echo.
    echo ❌ Erro ao executar migration.
    echo Verifique as credenciais do banco de dados.
)

pause



































