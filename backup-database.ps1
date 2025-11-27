# Script para fazer backup dos bancos de dados locais
# Execute este script antes de migrar para produção

Write-Host "🗄️  Fazendo backup dos bancos de dados..." -ForegroundColor Cyan

# Verificar se o Docker está rodando
$dockerRunning = docker ps 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker não está rodando. Inicie o Docker primeiro." -ForegroundColor Red
    exit 1
}

# Criar diretório de backup
$backupDir = ".\database-backup"
if (Test-Path $backupDir) {
    Remove-Item -Recurse -Force $backupDir
}
New-Item -ItemType Directory -Path $backupDir | Out-Null

Write-Host "📦 Criando backup do PostgreSQL..." -ForegroundColor Yellow

# Backup PostgreSQL
docker exec yugioh-postgres pg_dump -U yugioh_user yugioh_db > "$backupDir\postgres_backup.sql"
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backup PostgreSQL criado: $backupDir\postgres_backup.sql" -ForegroundColor Green
} else {
    Write-Host "❌ Erro ao criar backup do PostgreSQL" -ForegroundColor Red
}

Write-Host "📦 Criando backup do MongoDB..." -ForegroundColor Yellow

# Backup MongoDB
docker exec yugioh-mongodb mongodump --uri="mongodb://yugioh_mongo:yugioh_mongo_password@localhost:27017/yugioh_chat?authSource=admin" --out=/tmp/backup
docker cp yugioh-mongodb:/tmp/backup "$backupDir\mongodb_backup"
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backup MongoDB criado: $backupDir\mongodb_backup" -ForegroundColor Green
} else {
    Write-Host "❌ Erro ao criar backup do MongoDB" -ForegroundColor Red
}

Write-Host "📦 Criando backup do Redis..." -ForegroundColor Yellow

# Backup Redis (opcional, pois é cache temporário)
docker exec yugioh-redis redis-cli SAVE
docker cp yugioh-redis:/data/dump.rdb "$backupDir\redis_dump.rdb"
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backup Redis criado: $backupDir\redis_dump.rdb" -ForegroundColor Green
} else {
    Write-Host "⚠️  Redis backup opcional (cache temporário)" -ForegroundColor Yellow
}

Write-Host "`n✅ Backup completo! Arquivos salvos em: $backupDir" -ForegroundColor Green
Write-Host "`n📝 Próximos passos:" -ForegroundColor Cyan
Write-Host "   1. Crie os bancos de dados na Railway/Supabase/MongoDB Atlas"
Write-Host "   2. Use os arquivos de backup para restaurar os dados"
Write-Host "   3. Veja o arquivo DEPLOY_DATABASE.md para instruções detalhadas"

