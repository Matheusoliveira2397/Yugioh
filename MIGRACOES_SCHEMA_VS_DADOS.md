# 🔄 Migrações de Schema vs Dados - Guia Completo

## 🎯 Diferença Importante

### **Schema (Estrutura):**
- Tabelas, colunas, índices, constraints
- **Mudanças:** Novas tabelas, novas colunas, alterações de tipos
- **Como migrar:** **Migrations SQL** (não precisa de dump!)

### **Dados (Conteúdo):**
- Registros nas tabelas (users, cards, etc.)
- **Mudanças:** Novos registros, atualizações
- **Como migrar:** **Dump/Restore** ou **SQL INSERT**

---

## ✅ Processo Correto: Nova Tabela no Teste → Produção

### **Cenário: Você criou uma nova tabela no banco de teste**

**Exemplo:** Criou a tabela `notifications` no Docker (teste)

---

## 📋 PASSO 1: Criar Migration SQL

### **Opção A: Gerar SQL Automaticamente (Recomendado)**

Se você usa TypeORM, ele pode gerar a migration:

```bash
# No backend
npm run typeorm migration:generate -- -n CreateNotificationsTable
```

Isso cria um arquivo em `backend/src/migrations/XXXXX-CreateNotificationsTable.ts`

### **Opção B: Criar SQL Manualmente**

Crie um arquivo: `backend/migrations/002-create-notifications.sql`

```sql
-- Migration: Criar tabela notifications
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    CONSTRAINT "FK_notifications_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_notifications_user" ON "notifications"("userId");
```

---

## 📋 PASSO 2: Executar Migration no Supabase (Produção)

1. **No Supabase:** SQL Editor
2. **Cole o SQL da migration** (ex: `002-create-notifications.sql`)
3. **Execute** (Run)

**Pronto!** A tabela foi criada na produção. ✅

---

## 📋 PASSO 3: Se Precisar Migrar Dados da Nova Tabela

Se você já tem dados na tabela `notifications` no teste e quer migrar:

### **Exportar dados da nova tabela:**

```powershell
docker exec yugioh-postgres pg_dump -U yugioh_user -d yugioh_db --data-only --inserts -t notifications > notifications_data.sql
```

### **Importar no Supabase:**

1. No Supabase SQL Editor
2. Cole o conteúdo de `notifications_data.sql`
3. Execute

---

## 🎯 Resumo: Quando Usar Cada Método

| Mudança | Método | Quando Fazer |
|---------|--------|--------------|
| **Nova tabela** | Migration SQL | Sempre que criar tabela |
| **Nova coluna** | Migration SQL | Sempre que adicionar coluna |
| **Novo índice** | Migration SQL | Sempre que criar índice |
| **Novos dados** | Dump/Restore ou SQL INSERT | Quando precisar migrar dados |
| **Atualizar dados** | SQL UPDATE ou Dump | Quando precisar atualizar |

---

## ✅ Workflow Recomendado

### **1. Desenvolvimento (Docker/Teste):**
```bash
# Criar nova tabela via TypeORM ou SQL
# Testar localmente
```

### **2. Criar Migration:**
```bash
# Gerar migration automaticamente OU criar SQL manualmente
# Salvar em: backend/migrations/XXX-nome.sql
```

### **3. Produção (Supabase):**
```bash
# 1. Executar migration SQL no Supabase SQL Editor
# 2. (Opcional) Se tiver dados, exportar do teste e importar na produção
```

---

## 💡 Boas Práticas

### **✅ FAÇA:**
- ✅ Crie migrations SQL para TODAS as mudanças de schema
- ✅ Salve migrations em `backend/migrations/`
- ✅ Numere as migrations (001, 002, 003...)
- ✅ Teste migrations no ambiente de teste primeiro
- ✅ Documente o que cada migration faz

### **❌ NÃO FAÇA:**
- ❌ Não faça dump completo só para adicionar uma tabela
- ❌ Não altere schema diretamente na produção sem migration
- ❌ Não esqueça de executar migrations na produção

---

## 📁 Estrutura Recomendada

```
backend/
  migrations/
    001-complete-schema.sql          # Schema inicial (já feito)
    002-create-notifications.sql    # Nova tabela
    003-add-user-avatar-column.sql   # Nova coluna
    004-create-index-on-cards.sql    # Novo índice
    ...
```

---

## 🔄 Exemplo Completo: Adicionar Tabela `notifications`

### **1. No Docker (teste):**
```sql
-- Criar tabela localmente
CREATE TABLE notifications (...);
```

### **2. Criar Migration:**
```sql
-- backend/migrations/002-create-notifications.sql
CREATE TABLE IF NOT EXISTS "notifications" (...);
```

### **3. No Supabase (produção):**
- SQL Editor > Cole migration > Run ✅

### **4. (Opcional) Migrar dados:**
```powershell
# Se tiver dados no teste
docker exec yugioh-postgres pg_dump -U yugioh_user -d yugioh_db --data-only --inserts -t notifications > notifications_data.sql
# Importar no Supabase SQL Editor
```

---

## 🎯 Resposta Direta

**Pergunta:** "Se eu criar uma tabela nova no teste, preciso fazer dump de novo?"

**Resposta:** **NÃO!** 

1. ✅ Crie uma **migration SQL** para a nova tabela
2. ✅ Execute a migration no **Supabase SQL Editor**
3. ✅ (Opcional) Se tiver dados, exporte apenas essa tabela e importe

**Dump completo só é necessário quando:**
- Migrando pela primeira vez (já fizemos)
- Querendo fazer backup completo
- Querendo restaurar tudo do zero

---

## 📋 Checklist para Nova Tabela

- [ ] Tabela criada e testada no Docker
- [ ] Migration SQL criada (`backend/migrations/XXX-nome.sql`)
- [ ] Migration executada no Supabase
- [ ] Tabela verificada no Supabase Table Editor
- [ ] (Se necessário) Dados exportados do teste
- [ ] (Se necessário) Dados importados na produção

**Pronto! Não precisa fazer dump completo novamente! 🚀**
