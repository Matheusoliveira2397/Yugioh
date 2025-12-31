#!/bin/bash

# Script de restore do backup do PostgreSQL
# Uso: ./restore-database.sh backup_file.sql.gz

set -e

if [ -z "$1" ]; then
    echo "❌ Erro: Especifique o arquivo de backup"
    echo "Uso: ./restore-database.sh backup_file.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"
DB_NAME="${POSTGRES_DB:-yugioh_db}"
DB_USER="${POSTGRES_USER:-yugioh_user}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Erro: Arquivo de backup não encontrado: $BACKUP_FILE"
    exit 1
fi

echo "🔄 Restaurando backup: $BACKUP_FILE"

# Confirmar ação
read -p "⚠️  Isso irá SOBRESCREVER o banco de dados atual. Continuar? (s/n): " confirm
if [ "$confirm" != "s" ]; then
    echo "❌ Restore cancelado"
    exit 0
fi

# Restaurar
if [ -n "$POSTGRES_PASSWORD" ]; then
    export PGPASSWORD="$POSTGRES_PASSWORD"
    
    # Descompactar e restaurar
    gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"
    
    echo "✅ Restore concluído com sucesso!"
else
    echo "❌ Erro: POSTGRES_PASSWORD não definido"
    exit 1
fi
