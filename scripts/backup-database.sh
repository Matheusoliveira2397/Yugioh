#!/bin/bash

# Script de backup automático do PostgreSQL
# Uso: ./backup-database.sh

set -e

# Configurações
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgres}"
DB_NAME="${POSTGRES_DB:-yugioh_db}"
DB_USER="${POSTGRES_USER:-yugioh_user}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# Criar diretório de backup se não existir
mkdir -p "$BACKUP_DIR"

# Nome do arquivo de backup
BACKUP_FILE="$BACKUP_DIR/backup_${DB_NAME}_${DATE}.sql.gz"

echo "🔄 Iniciando backup do banco de dados: $DB_NAME"

# Fazer backup
if [ -n "$POSTGRES_PASSWORD" ]; then
    export PGPASSWORD="$POSTGRES_PASSWORD"
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" | gzip > "$BACKUP_FILE"
else
    echo "❌ Erro: POSTGRES_PASSWORD não definido"
    exit 1
fi

# Verificar se backup foi criado
if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "✅ Backup criado com sucesso: $BACKUP_FILE ($BACKUP_SIZE)"
else
    echo "❌ Erro: Falha ao criar backup"
    exit 1
fi

# Remover backups antigos (manter apenas últimos N dias)
echo "🧹 Removendo backups mais antigos que $RETENTION_DAYS dias..."
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Listar backups restantes
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" | wc -l)
echo "📦 Total de backups mantidos: $BACKUP_COUNT"

echo "✅ Backup concluído!"
