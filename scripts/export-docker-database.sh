#!/bin/bash

# Script para exportar banco de dados do Docker
# Uso: ./export-docker-database.sh

set -e

echo "========================================"
echo "Exportando banco de dados do Docker"
echo "========================================"
echo ""

# Valores do docker-compose.yml
CONTAINER_NAME="yugioh-postgres"
DB_USER="yugioh_user"
DB_NAME="yugioh_db"

# Verificar se Docker está rodando
if ! docker ps > /dev/null 2>&1; then
    echo "❌ ERRO: Docker não está rodando!"
    echo "Inicie o Docker e tente novamente."
    exit 1
fi

echo "[1/3] Verificando container..."
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
echo ""

# Verificar se container existe
if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "❌ ERRO: Container '$CONTAINER_NAME' não encontrado!"
    echo "Containers disponíveis:"
    docker ps --format "{{.Names}}"
    exit 1
fi

echo "[2/3] Criando backup..."
echo "Container: $CONTAINER_NAME"
echo "Usuário: $DB_USER"
echo "Banco: $DB_NAME"
echo ""

# Criar backup com timestamp
BACKUP_FILE="yugioh_backup_$(date +%Y%m%d_%H%M%S).dump"

docker exec -t "$CONTAINER_NAME" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo ""
    echo "[3/3] ✅ Backup criado com sucesso!"
    echo ""
    echo "📦 Arquivo: $BACKUP_FILE"
    echo "📊 Tamanho: $BACKUP_SIZE"
    echo ""
    echo "📋 Próximo passo:"
    echo "1. Execute as migrations SQL no Supabase (001-complete-schema.sql)"
    echo "2. Importe o backup usando:"
    echo "   pg_restore -Fc -d \"SUA_CONNECTION_STRING_SUPABASE\" $BACKUP_FILE"
else
    echo ""
    echo "❌ ERRO: Falha ao criar backup!"
    echo "Verifique se o container está rodando: docker ps"
    exit 1
fi
