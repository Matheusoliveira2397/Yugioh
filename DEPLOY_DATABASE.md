# 🗄️ Guia de Deploy do Banco de Dados

Como o Vercel hospeda apenas o frontend, você precisa fazer deploy dos bancos de dados em serviços separados.

## 💰 Planos Gratuitos - Comparação

### ✅ Opções 100% Gratuitas (Recomendadas para começar):

| Serviço | Plano Gratuito | Limites |
|---------|---------------|---------|
| **Supabase** (PostgreSQL) | ✅ Gratuito | 500 MB de banco, 2 GB de bandwidth, ilimitado por tempo |
| **MongoDB Atlas** (MongoDB) | ✅ Gratuito (M0) | 512 MB de armazenamento, ilimitado por tempo |
| **Upstash** (Redis) | ✅ Gratuito | 10.000 comandos/dia, 256 MB de memória |
| **Neon** (PostgreSQL) | ✅ Gratuito | 0.5 GB de armazenamento, ilimitado por tempo |
| **Render** (Backend) | ⚠️ Gratuito limitado | Backend dorme após 15min inativo, 750h/mês |

### ⚠️ Opções com Créditos Gratuitos (Depois cobram):

| Serviço | Crédito Gratuito | Depois |
|---------|-----------------|--------|
| **Railway** | $5 grátis/mês | ~$0.01/hora de uso (pode esgotar rápido) |

### 📊 Recomendação por Orçamento:

**💰 100% Gratuito (Melhor para começar):**
- PostgreSQL: **Supabase** ou **Neon** (gratuito para sempre)
- MongoDB: **MongoDB Atlas** (gratuito para sempre)
- Redis: **Upstash** (gratuito para sempre)
- Backend: **Render** (gratuito, mas dorme após inatividade)

**💵 Com pequeno orçamento ($5-10/mês):**
- Tudo no **Railway** (mais fácil, mas pode custar)

---

## 📋 Opções Recomendadas

### Opção 1: Railway (⭐ RECOMENDADO - Mais Fácil)
Railway suporta PostgreSQL, MongoDB e Redis em um único lugar.

**Passos:**
1. Acesse: https://railway.app
2. Faça login com GitHub
3. Clique em "New Project" → "Deploy from GitHub repo"
4. Adicione 3 serviços:
   - **PostgreSQL**: Clique em "New" → "Database" → "PostgreSQL"
   - **MongoDB**: Clique em "New" → "Database" → "MongoDB"
   - **Redis**: Clique em "New" → "Database" → "Redis"

5. Para cada banco, copie a **Connection String** (DATABASE_URL, MONGODB_URI, REDIS_URL)

6. Configure as variáveis de ambiente no seu backend (se estiver no Railway também) ou no Vercel

---

### Opção 2: Supabase (PostgreSQL) + MongoDB Atlas + Upstash (Redis)

#### PostgreSQL - Supabase
1. Acesse: https://supabase.com
2. Crie um projeto
3. Vá em "Settings" → "Database"
4. Copie a **Connection String** (formato: `postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres`)

#### MongoDB - MongoDB Atlas
1. Acesse: https://www.mongodb.com/cloud/atlas
2. Crie uma conta gratuita
3. Crie um cluster (escolha a região mais próxima)
4. Configure usuário e senha
5. Adicione seu IP (ou 0.0.0.0/0 para permitir todos)
6. Copie a **Connection String** (formato: `mongodb+srv://[USER]:[PASSWORD]@[CLUSTER].mongodb.net/yugioh_chat?retryWrites=true&w=majority`)

#### Redis - Upstash
1. Acesse: https://upstash.com
2. Crie uma conta
3. Crie um database Redis
4. Copie a **Connection String** (formato: `redis://default:[PASSWORD]@[HOST]:[PORT]`)

---

### Opção 3: Neon (PostgreSQL) + MongoDB Atlas + Upstash (Redis)

#### PostgreSQL - Neon
1. Acesse: https://neon.tech
2. Crie um projeto
3. Copie a **Connection String** do dashboard

---

## 🔧 Configuração das Variáveis de Ambiente

Depois de criar os bancos, você precisa configurar as variáveis de ambiente:

### Se o Backend estiver no Railway:
1. Vá no projeto do backend
2. Clique em "Variables"
3. Adicione:
   ```
   DATABASE_URL=postgresql://[sua-connection-string]
   MONGODB_URI=mongodb://[sua-connection-string]
   REDIS_URL=redis://[sua-connection-string]
   JWT_SECRET=[sua-chave-secreta]
   CORS_ORIGIN=https://[seu-frontend-vercel].vercel.app
   ```

### Se o Backend estiver no Vercel (Serverless Functions):
1. Vá no projeto no Vercel
2. Settings → Environment Variables
3. Adicione as mesmas variáveis acima

---

## 📤 Migração dos Dados Locais

Para migrar os dados do seu banco local para o banco em produção:

### PostgreSQL:
```bash
# Fazer dump do banco local
pg_dump -h localhost -U yugioh_user -d yugioh_db > backup.sql

# Restaurar no banco de produção (substitua pela connection string do Railway/Supabase)
psql [CONNECTION_STRING] < backup.sql
```

### MongoDB:
```bash
# Fazer dump
mongodump --uri="mongodb://yugioh_mongo:yugioh_mongo_password@localhost:27017/yugioh_chat?authSource=admin" --out=./backup

# Restaurar (substitua pela connection string do MongoDB Atlas)
mongorestore --uri="[MONGODB_ATLAS_CONNECTION_STRING]" ./backup/yugioh_chat
```

### Redis:
Os dados do Redis são temporários (cache), então não precisa migrar. Mas se quiser:
```bash
# Fazer dump
redis-cli --rdb dump.rdb

# Restaurar (conecte no Redis de produção e importe)
```

---

## 🚀 Deploy do Backend

Você também precisa fazer deploy do backend. Opções:

### Railway (Recomendado):
1. No mesmo projeto Railway, adicione um novo serviço
2. Conecte ao repositório GitHub
3. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run start:prod`
4. Adicione todas as variáveis de ambiente

### Render:
1. Acesse: https://render.com
2. New → Web Service
3. Conecte o repositório
4. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start:prod`

---

## ✅ Checklist Final

- [ ] PostgreSQL criado e connection string copiada
- [ ] MongoDB criado e connection string copiada
- [ ] Redis criado e connection string copiada
- [ ] Variáveis de ambiente configuradas no backend
- [ ] Dados migrados (se necessário)
- [ ] Backend deployado e funcionando
- [ ] Frontend no Vercel apontando para o backend de produção
- [ ] Testar todas as funcionalidades

---

## 🔗 Links Úteis

- **Railway**: https://railway.app
- **Supabase**: https://supabase.com
- **Neon**: https://neon.tech
- **MongoDB Atlas**: https://www.mongodb.com/cloud/atlas
- **Upstash**: https://upstash.com
- **Render**: https://render.com

---

## 💡 Dica

A opção mais simples é usar **Railway** para tudo (PostgreSQL, MongoDB, Redis e Backend), pois tudo fica em um único lugar e é muito fácil de configurar!

