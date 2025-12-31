#!/bin/bash

# Script para fazer dump do PostgreSQL
# Uso: ./dump-postgres.sh [arquivo_saida]

set -e

# Configurações
OUTPUT_FILE="${1:-yugioh_backup_$(date +%Y%m%d_%H%M%S).sql}"
DATABASE_URL="${DATABASE_URL}"

# Verificar se DATABASE_URL está definida
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Erro: DATABASE_URL não está definida"
    echo "Configure a variável de ambiente:"
    echo "  export DATABASE_URL='postgresql://usuario:senha@host:porta/database'"
    echo "Ou passe como parâmetro:"
    echo "  DATABASE_URL='...' ./dump-postgres.sh"
    exit 1
fi

echo "🔄 Iniciando dump do banco de dados..."
echo "📁 Arquivo de saída: $OUTPUT_FILE"

# Verificar se pg_dump está disponível
if ! command -v pg_dump &> /dev/null; then
    echo "❌ Erro: pg_dump não encontrado"
    echo "Instale o PostgreSQL client tools:"
    echo "  Ubuntu/Debian: sudo apt-get install postgresql-client"
    echo "  macOS: brew install postgresql"
    exit 1
fi

# Fazer dump
echo "📦 Fazendo dump..."
pg_dump "$DATABASE_URL" --no-owner --no-acl --clean --if-exists -f "$OUTPUT_FILE"

if [ $? -eq 0 ]; then
    FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    echo "✅ Dump criado com sucesso!"
    echo "📁 Arquivo: $OUTPUT_FILE"
    echo "📊 Tamanho: $FILE_SIZE"
    
    # Perguntar se quer comprimir
    read -p "Deseja comprimir o arquivo? (s/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        echo "🗜️ Comprimindo..."
        gzip "$OUTPUT_FILE"
        COMPRESSED_FILE="${OUTPUT_FILE}.gz"
        COMPRESSED_SIZE=$(du -h "$COMPRESSED_FILE" | cut -f1)
        echo "✅ Arquivo comprimido: $COMPRESSED_FILE ($COMPRESSED_SIZE)"
    fi
else
    echo "❌ Erro ao fazer dump"
    exit 1
fi

echo ""
echo "✅ Dump concluído!"

