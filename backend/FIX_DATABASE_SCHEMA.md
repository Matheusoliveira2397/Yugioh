# Correção do Schema do Banco de Dados

## Problemas Identificados

1. **Coluna `division` ausente na tabela `users`**
   - Erro: `QueryFailedError: column ... division does not exist`
   - Causa: A migração `add-division-to-users.sql` não foi executada
   - Solução: Execute a migração abaixo

2. **Coluna `isOnline` vs `is_online` em queries SQL diretas**
   - Erro: `QueryFailedError: column "is_online" does not exist`
   - Causa: O banco usa `isOnline` (camelCase), mas queries SQL usavam `is_online` (snake_case)
   - Solução: Já corrigido no código

## Migrações Necessárias

### 1. Adicionar coluna `division` à tabela `users`

Execute o seguinte SQL no seu banco de dados (Supabase SQL Editor ou psql):

```sql
-- Adicionar coluna division na tabela users
-- Todos os usuários começam na divisão Bronze

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS division VARCHAR(50) DEFAULT 'Bronze';

-- Atualizar todos os usuários existentes para Bronze se não tiverem divisão
UPDATE users 
SET division = 'Bronze' 
WHERE division IS NULL OR division = '';

-- Criar índice para melhorar performance em queries por divisão
CREATE INDEX IF NOT EXISTS idx_users_division ON users(division);
```

### 2. Verificar coluna `isOnline`

A coluna `isOnline` já deve existir na tabela `users` (criada na migração inicial). Se não existir, execute:

```sql
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS "isOnline" BOOLEAN DEFAULT true;
```

## Como Executar

### Opção 1: Supabase SQL Editor
1. Acesse o Supabase Dashboard
2. Vá em "SQL Editor"
3. Cole o SQL acima
4. Execute

### Opção 2: psql (PostgreSQL local)
```bash
psql -U seu_usuario -d seu_banco -f backend/migrations/add-division-to-users.sql
```

### Opção 3: Script Batch (Windows - Docker local)
```bash
backend\execute-division-migration.bat
```

## Verificação

Após executar as migrações, verifique se as colunas existem:

```sql
-- Verificar se a coluna division existe
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'division';

-- Verificar se a coluna isOnline existe
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'isOnline';
```

## Endpoints Afetados

Os seguintes endpoints podem falhar até que a migração seja executada:
- `/friends/pending` - Erro ao buscar amigos pendentes
- `/friends/user/:userId` - Erro ao buscar informações de amigo
- `/groups/*` - Erros ao buscar grupos e membros
- `/duels/history/user/:userId` - Erro ao buscar histórico de duelos
- `/duels/direct-match/:opponentId` - Endpoint de confronto direto

## Nota Importante

Após executar as migrações, **reinicie o servidor backend** para garantir que todas as mudanças sejam aplicadas.



































