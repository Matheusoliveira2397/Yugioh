# 🚀 Executar Migration: Sistema de Skins para Cartas

## ⚠️ ERRO ATUAL
```
column Card.skinId does not exist
```

Este erro ocorre porque a migration SQL ainda não foi executada no banco de dados.

---

## 📋 OPÇÃO 1: Executar no Supabase (Produção)

Se você está usando Supabase como banco de dados:

1. **Acesse o Supabase Dashboard**
   - Vá para o seu projeto
   - Clique em **"SQL Editor"** no menu lateral

2. **Cole o conteúdo da migration**
   - Abra o arquivo: `backend/migrations/add-skin-id-to-cards.sql`
   - Copie todo o conteúdo SQL
   - Cole no SQL Editor do Supabase

3. **Execute a migration**
   - Clique em **"Run"** ou pressione `Ctrl+Enter`
   - Aguarde a execução completar

4. **Verificar se funcionou**
   ```sql
   SELECT column_name, data_type, column_default 
   FROM information_schema.columns 
   WHERE table_name = 'cards' AND column_name = 'skinId';
   ```
   Deve retornar uma linha com informações sobre a coluna `skinId`.

---

## 📋 OPÇÃO 2: Executar no Docker Local (Desenvolvimento)

Se você está usando Docker localmente:

### Método A: Usando o script batch (Windows)
```powershell
cd backend
.\execute-skin-id-migration.bat
```

### Método B: Executar manualmente
```powershell
# 1. Verificar se o container está rodando
docker ps | findstr yugioh-postgres

# 2. Se não estiver rodando, iniciar
docker start yugioh-postgres

# 3. Executar a migration
docker exec -i yugioh-postgres psql -U yugioh_user -d yugioh_db < migrations\add-skin-id-to-cards.sql

# 4. Verificar se funcionou
docker exec -i yugioh-postgres psql -U yugioh_user -d yugioh_db -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'cards' AND column_name = 'skinId';"
```

### Método C: Usando psql diretamente (se tiver instalado)
```powershell
psql -h localhost -p 5432 -U yugioh_user -d yugioh_db -f backend\migrations\add-skin-id-to-cards.sql
```

---

## 📋 OPÇÃO 3: Executar via TypeORM (se configurado)

Se você tem TypeORM migrations configuradas:

```bash
cd backend
npm run typeorm migration:run
```

**Nota:** Este método só funciona se você tiver configurado TypeORM migrations. Caso contrário, use as opções 1 ou 2.

---

## ✅ Verificação Pós-Migration

Após executar a migration, verifique se tudo está correto:

```sql
-- 1. Verificar se a coluna existe
SELECT column_name, data_type, column_default, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'cards' AND column_name = 'skinId';

-- 2. Verificar se todas as cartas têm skinId = 'original'
SELECT COUNT(*) as total_cards, 
       COUNT(CASE WHEN "skinId" = 'original' THEN 1 END) as original_skins
FROM "cards";

-- 3. Verificar se a constraint única composta foi criada
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'cards' 
AND indexname LIKE '%idCarta_skinId%';
```

---

## 🔧 O que a Migration Faz

1. ✅ Remove a constraint UNIQUE de `idCarta` (permite múltiplas skins)
2. ✅ Adiciona coluna `skinId` com valor padrão `'original'`
3. ✅ Atualiza todas as cartas existentes para `skinId = 'original'`
4. ✅ Torna `skinId` NOT NULL
5. ✅ Cria índices para melhorar performance
6. ✅ Cria constraint única composta (`idCarta` + `skinId`)

---

## ⚠️ IMPORTANTE

- **Backup:** Sempre faça backup antes de executar migrations em produção
- **Teste:** Teste primeiro em ambiente de desenvolvimento
- **Ordem:** Execute a migration antes de usar o sistema de skins

---

## 🆘 Problemas Comuns

### Erro: "constraint does not exist"
- **Causa:** A constraint `cards_idCarta_key` pode ter outro nome
- **Solução:** A migration usa `DROP CONSTRAINT IF EXISTS`, então é seguro mesmo se não existir

### Erro: "column already exists"
- **Causa:** A migration já foi executada parcialmente
- **Solução:** A migration usa `ADD COLUMN IF NOT EXISTS`, então é seguro executar novamente

### Erro: "permission denied"
- **Causa:** Usuário do banco não tem permissões suficientes
- **Solução:** Verifique se o usuário tem permissões ALTER TABLE e CREATE INDEX

---

## 📞 Suporte

Se encontrar problemas, verifique:
1. Logs do banco de dados
2. Logs da aplicação
3. Permissões do usuário do banco

