# 🚀 Guia Rápido: Deploy do Banco de Dados

## ⚠️ Importante
O **Vercel** só hospeda o **frontend**. Você precisa hospedar os bancos de dados separadamente.

## 💰 É Gratuito?

### ✅ SIM! Existem opções 100% gratuitas:

**Opção 1 - 100% Gratuita (Recomendada):**
- PostgreSQL: **Supabase** ou **Neon** (gratuito para sempre)
- MongoDB: **MongoDB Atlas** (gratuito para sempre)  
- Redis: **Upstash** (gratuito para sempre)
- Backend: **Render** (gratuito, mas dorme após 15min inativo)

**Opção 2 - Com crédito inicial:**
- **Railway**: $5 grátis/mês, depois cobra ~$0.01/hora (pode esgotar rápido)

**💡 Recomendação:** Comece com a Opção 1 (100% gratuita). Se precisar de mais recursos depois, migre para Railway.

---

## 🎯 Solução Mais Simples: Railway (Com crédito inicial)

### Passo 1: Criar Conta no Railway
1. Acesse: https://railway.app
2. Faça login com sua conta GitHub
3. Clique em **"New Project"**

### Passo 2: Adicionar PostgreSQL
1. Clique em **"New"** → **"Database"** → **"Add PostgreSQL"**
2. Aguarde a criação (alguns segundos)
3. Clique no banco criado
4. Vá na aba **"Connect"**
5. Copie a **"Connection String"** (DATABASE_URL)

### Passo 3: Adicionar MongoDB
1. Clique em **"New"** → **"Database"** → **"Add MongoDB"**
2. Aguarde a criação
3. Clique no banco criado
4. Vá na aba **"Connect"**
5. Copie a **"Connection String"** (MONGODB_URI)

### Passo 4: Adicionar Redis
1. Clique em **"New"** → **"Database"** → **"Add Redis"**
2. Aguarde a criação
3. Clique no banco criado
4. Vá na aba **"Connect"**
5. Copie a **"Connection String"** (REDIS_URL)

### Passo 5: Deploy do Backend no Railway
1. No mesmo projeto, clique em **"New"** → **"GitHub Repo"**
2. Selecione seu repositório **Yugioh**
3. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run start:prod`
4. Clique em **"Variables"** e adicione:
   ```
   DATABASE_URL=[cole a connection string do PostgreSQL]
   MONGODB_URI=[cole a connection string do MongoDB]
   REDIS_URL=[cole a connection string do Redis]
   JWT_SECRET=[uma chave secreta aleatória]
   CORS_ORIGIN=https://[seu-projeto].vercel.app
   PORT=3000
   NODE_ENV=production
   ```
5. Aguarde o deploy

### Passo 6: Migrar Dados (Opcional)
Se você tem dados no banco local que quer manter:

1. Execute o script de backup:
   ```powershell
   .\backup-database.ps1
   ```

2. Para restaurar no PostgreSQL do Railway:
   - Instale o PostgreSQL localmente ou use o Railway CLI
   - Execute: `psql [CONNECTION_STRING] < database-backup\postgres_backup.sql`

### Passo 7: Atualizar Frontend no Vercel
1. No Vercel, vá em **Settings** → **Environment Variables**
2. Adicione:
   ```
   VITE_API_URL=https://[seu-backend-railway].railway.app
   VITE_WS_URL=https://[seu-backend-railway].railway.app
   ```
3. Faça um novo deploy

---

## 🆓 Opção 100% Gratuita (Recomendada)

Se você quer evitar qualquer custo, use esta combinação:

### 1. PostgreSQL - Supabase (Gratuito)
1. Acesse: https://supabase.com
2. Crie uma conta (gratuita)
3. Crie um novo projeto
4. Vá em **Settings** → **Database**
5. Copie a **Connection String** (formato: `postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres`)

**Limite gratuito:** 500 MB de banco, ilimitado por tempo ✅

### 2. MongoDB - MongoDB Atlas (Gratuito)
1. Acesse: https://www.mongodb.com/cloud/atlas
2. Crie uma conta (gratuita)
3. Crie um cluster **M0 Free** (gratuito)
4. Configure usuário e senha
5. Em **Network Access**, adicione `0.0.0.0/0` (permitir todos os IPs)
6. Copie a **Connection String** (formato: `mongodb+srv://[USER]:[PASSWORD]@[CLUSTER].mongodb.net/yugioh_chat?retryWrites=true&w=majority`)

**Limite gratuito:** 512 MB de armazenamento, ilimitado por tempo ✅

### 3. Redis - Upstash (Gratuito)
1. Acesse: https://upstash.com
2. Crie uma conta (gratuita)
3. Crie um novo database Redis
4. Escolha região mais próxima
5. Copie a **Connection String** (formato: `redis://default:[PASSWORD]@[HOST]:[PORT]`)

**Limite gratuito:** 10.000 comandos/dia, 256 MB de memória ✅

### 4. Backend - Render (Gratuito)
1. Acesse: https://render.com
2. Crie uma conta (gratuita)
3. **New** → **Web Service**
4. Conecte seu repositório GitHub
5. Configure:
   - **Name**: yugioh-backend
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start:prod`
6. Adicione as variáveis de ambiente:
   ```
   DATABASE_URL=[connection string do Supabase]
   MONGODB_URI=[connection string do MongoDB Atlas]
   REDIS_URL=[connection string do Upstash]
   JWT_SECRET=[uma chave secreta aleatória]
   CORS_ORIGIN=https://[seu-projeto].vercel.app
   PORT=3000
   NODE_ENV=production
   ```

**Limite gratuito:** Backend dorme após 15min inativo, 750h/mês ✅

### 5. Atualizar Frontend no Vercel
1. No Vercel, vá em **Settings** → **Environment Variables**
2. Adicione:
   ```
   VITE_API_URL=https://[seu-backend-render].onrender.com
   VITE_WS_URL=https://[seu-backend-render].onrender.com
   ```
3. Faça um novo deploy

**⚠️ Nota:** O Render gratuito pode demorar ~30 segundos para "acordar" após inatividade. Para evitar isso, considere Railway (pago) ou upgrade no Render.

---

## ✅ Checklist

- [ ] PostgreSQL criado e connection string copiada
- [ ] MongoDB criado e connection string copiada  
- [ ] Redis criado e connection string copiada
- [ ] Backend deployado no Railway/Render
- [ ] Variáveis de ambiente configuradas
- [ ] Dados migrados (se necessário)
- [ ] Frontend atualizado com URL do backend
- [ ] Testado e funcionando!

---

## 💡 Dicas

**Para começar sem custos:**
- Use a **Opção 100% Gratuita** (Supabase + MongoDB Atlas + Upstash + Render)
- É suficiente para desenvolvimento e projetos pequenos
- Todos os serviços são gratuitos para sempre (com limites razoáveis)

**Se precisar de mais recursos:**
- Railway é mais fácil (tudo em um lugar), mas pode custar após os $5 grátis
- Render tem planos pagos que não dormem após inatividade

---

## 🆘 Problemas Comuns

**Erro de conexão:**
- Verifique se as connection strings estão corretas
- Verifique se o CORS está configurado no backend
- Verifique se as variáveis de ambiente estão configuradas

**Backend não inicia:**
- Verifique os logs no Railway
- Certifique-se que o comando `start:prod` existe no package.json
- Verifique se todas as variáveis de ambiente estão configuradas

