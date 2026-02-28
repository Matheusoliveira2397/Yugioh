@echo off
echo Executando migration para criar tabela news_views...
echo.

REM Ajuste estas variáveis conforme seu ambiente
set DB_HOST=localhost
set DB_PORT=5432
set DB_NAME=yugioh_db
set DB_USER=yugioh_user
set DB_PASSWORD=yugioh_password

REM Executar migration
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f migrations\create-news-views-table.sql

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Migration executada com sucesso!
    echo A tabela news_views foi criada.
) else (
    echo.
    echo ❌ Erro ao executar migration.
    echo Verifique as credenciais do banco de dados.
)

pause

