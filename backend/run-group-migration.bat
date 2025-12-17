@echo off
echo Executando migration para adicionar colunas ao grupo...
echo.
echo Por favor, configure a variável DATABASE_URL antes de executar:
echo set DATABASE_URL=postgresql://usuario:senha@host:porta/banco
echo.
echo Ou execute manualmente o SQL:
echo psql -h host -U usuario -d banco -f src/modules/groups/migrations/add-group-stats-columns.sql
echo.
pause
