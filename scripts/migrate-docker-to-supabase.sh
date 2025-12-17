#!/bin/bash

# Script para migrar dados do Docker para Supabase
# Uso: ./migrate-docker-to-supabase.sh

set -e

echo "🚀 Migração: Docker → Supabase"
echo "================================"
echo ""

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Identificar container
echo -e "${YELLOW}📦 Passo 1: Identificando container Docker...${NC}"
echo "Containers em execução:"
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
echo ""
read -p "Digite o nome do container PostgreSQL: " CONTAINER_NAME

if [ -z "$CONTAINER_NAME" ]; then
    echo -e "${RED}❌ Erro: Nome do container não pode estar vazio${NC}"
    exit 1
fi

# 2. Verificar se container existe
if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}❌ Erro: Container '$CONTAINER_NAME' não encontrado${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Container encontrado: $CONTAINER_NAME${NC}"
echo ""

# 3. Obter informações do banco
echo -e "${YELLOW}📋 Passo 2: Informações do banco de dados${NC}"
read -p "Usuário do banco (padrão: postgres): " DB_USER
DB_USER=${DB_USER:-postgres}

read -p "Nome do banco (padrão: postgres): " DB_NAME
DB_NAME=${DB_NAME:-postgres}

read -p "Senha do banco: " -s DB_PASSWORD
echo ""

# 4. Criar backup
echo ""
echo -e "${YELLOW}💾 Passo 3: Criando backup...${NC}"
BACKUP_FILE="yugioh_backup_$(date +%Y%m%d_%H%M%S).dump"

docker exec -t "$CONTAINER_NAME" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✅ Backup criado: $BACKUP_FILE ($BACKUP_SIZE)${NC}"
else
    echo -e "${RED}❌ Erro ao criar backup${NC}"
    exit 1
fi

# 5. Obter connection string do Supabase
echo ""
echo -e "${YELLOW}🔗 Passo 4: Connection String do Supabase${NC}"
echo "1. Vá em: Supabase > Settings > Database"
echo "2. Copie a Connection String (URI)"
echo "3. Substitua [YOUR-PASSWORD] pela senha real"
echo ""
read -p "Cole a connection string completa do Supabase: " SUPABASE_URL

if [ -z "$SUPABASE_URL" ]; then
    echo -e "${RED}❌ Erro: Connection string não pode estar vazia${NC}"
    exit 1
fi

# 6. Verificar se pg_restore está instalado
echo ""
echo -e "${YELLOW}🔍 Passo 5: Verificando dependências...${NC}"
if ! command -v pg_restore &> /dev/null; then
    echo -e "${RED}❌ pg_restore não encontrado${NC}"
    echo "Instale o cliente PostgreSQL:"
    echo "  Linux: sudo apt install postgresql-client"
    echo "  Mac: brew install postgresql"
    echo "  Windows: Baixe de https://www.postgresql.org/download/"
    exit 1
fi

echo -e "${GREEN}✅ pg_restore encontrado${NC}"

# 7. Confirmar importação
echo ""
echo -e "${YELLOW}⚠️  ATENÇÃO:${NC}"
echo "Você já executou as migrations SQL no Supabase?"
echo "(As tabelas precisam existir antes de importar os dados)"
read -p "Continuar com a importação? (s/n): " CONFIRM

if [ "$CONFIRM" != "s" ]; then
    echo "Importação cancelada."
    echo "Execute as migrations no Supabase primeiro e depois rode este script novamente."
    exit 0
fi

# 8. Importar para Supabase
echo ""
echo -e "${YELLOW}📥 Passo 6: Importando dados para Supabase...${NC}"
echo "Isso pode levar alguns minutos..."

pg_restore -Fc -d "$SUPABASE_URL" "$BACKUP_FILE" 2>&1 | tee restore.log

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Importação concluída com sucesso!${NC}"
    echo ""
    echo "📋 Próximos passos:"
    echo "1. Vá no Supabase > Database > Table Editor"
    echo "2. Verifique se os dados foram importados"
    echo "3. Verifique os logs em: restore.log"
else
    echo ""
    echo -e "${RED}❌ Erro durante a importação${NC}"
    echo "Verifique os logs em: restore.log"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Migração concluída!${NC}"
