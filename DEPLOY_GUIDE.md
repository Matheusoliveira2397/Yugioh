# 🚀 Guia de Deploy - Yu-Gi-Oh! Online

## 📋 Visão Geral

Este projeto possui:
- **Frontend**: React + Vite (pode ser hospedado no Vercel)
- **Backend**: NestJS + PostgreSQL + MongoDB + Redis (precisa de servidor dedicado)

---

## 🎯 Opção 1: Frontend no Vercel + Backend no Railway/Render (RECOMENDADO)

### **1. Deploy do Frontend no Vercel**

#### Passo 1: Instalar Vercel CLI
```bash
npm install -g vercel
```

#### Passo 2: Login no Vercel
```bash
vercel login
```

#### Passo 3: Deploy do Frontend
```bash
cd frontend
vercel
```

Siga as instruções:
- Set up and deploy? **Y**
- Which scope? Selecione sua conta
- Link to existing project? **N**
- What's your project's name? **yugioh-online**
- In which directory is your code located? **./**
- Want to override the settings? **Y**
  - Build Command: `npm run build`
  - Output Directory: `dist`
  - Development Command: `npm run dev`

#### Passo 4: Configurar Variáveis de Ambiente no Vercel

No dashboard do Vercel (https://vercel.com/dashboard):
1. Vá em **Settings** > **Environment Variables**
2. Adicione:
   ```
   VITE_API_URL = https://seu-backend.railway.app
   VITE_WS_URL = wss://seu-backend.railway.app
   ```

---

### **2. Deploy do Backend no Railway (GRÁTIS com $5/mês de crédito)**

#### Por que Railway?
- ✅ Suporta Docker
- ✅ PostgreSQL, MongoDB e Redis inclusos
- ✅ $5/mês de crédito grátis
- ✅ Deploy automático do GitHub

#### Passo 1: Criar conta no Railway
1. Acesse: https://railway.app
2. Faça login com GitHub

#### Passo 2: Criar novo projeto
1. Clique em "New Project"
2. Selecione "Deploy from GitHub repo"
3. Escolha o repositório **Yugioh**

#### Passo 3: Adicionar serviços de banco de dados
No Railway:
1. Clique em "+ New"
2. Adicione:
   - **PostgreSQL** (Database)
   - **MongoDB** (Database)
   - **Redis** (Database)

#### Passo 4: Configurar variáveis de ambiente do Backend

Vá em **Variables** do seu serviço backend e adicione:
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}
MONGODB_URI=${{MongoDB.MONGO_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=seu_jwt_secret_super_seguro_aqui_2024
CORS_ORIGIN=https://seu-frontend.vercel.app
```

#### Passo 5: Deploy
- Railway detectará o `Dockerfile` e fará build automaticamente
- Aguarde o deploy (pode levar 5-10 minutos)
- Copie a URL do backend gerada (ex: `https://yugioh-backend-production.railway.app`)

---

## 🎯 Opção 2: Backend no Render.com (Alternativa)

### **Deploy do Backend no Render**

#### Passo 1: Criar conta
1. Acesse: https://render.com
2. Login com GitHub

#### Passo 2: Criar Web Service
1. New > Web Service
2. Conecte seu repositório GitHub **Yugioh**
3. Configure:
   - **Name**: yugioh-backend
   - **Root Directory**: backend
   - **Environment**: Docker
   - **Plan**: Free

#### Passo 3: Adicionar bancos de dados
1. New > PostgreSQL
2. New > MongoDB (use MongoDB Atlas - free tier)
3. New > Redis

#### Passo 4: Configurar Environment Variables
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=sua_url_postgres
MONGODB_URI=sua_url_mongodb
REDIS_URL=sua_url_redis
JWT_SECRET=seu_jwt_secret
CORS_ORIGIN=https://seu-frontend.vercel.app
```

---

## 🎯 Opção 3: Tudo em VPS (Controle Total)

### **Serviços recomendados:**
- **DigitalOcean** - $6/mês
- **Linode** - $5/mês
- **AWS EC2** - Free tier 1 ano
- **Google Cloud** - $300 créditos grátis

### **Setup Rápido (Docker):**
```bash
# Conectar via SSH
ssh root@seu-ip

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Clonar repositório
git clone https://github.com/Matheusoliveira2397/Yugioh.git
cd Yugioh

# Configurar variáveis
nano .env

# Rodar com Docker
docker-compose up -d

# Configurar Nginx como proxy reverso
# Frontend: seu-dominio.com
# Backend: api.seu-dominio.com
```

---

## 📝 Checklist de Deploy

### Antes do Deploy:
- [ ] Criar conta no Vercel
- [ ] Criar conta no Railway/Render
- [ ] Ter repositório no GitHub atualizado
- [ ] Definir JWT_SECRET seguro
- [ ] Configurar CORS para domínio de produção

### Frontend (Vercel):
- [ ] Deploy realizado
- [ ] Variáveis de ambiente configuradas
- [ ] VITE_API_URL apontando para backend
- [ ] VITE_WS_URL apontando para WebSocket
- [ ] Custom domain configurado (opcional)

### Backend (Railway/Render):
- [ ] PostgreSQL configurado
- [ ] MongoDB configurado
- [ ] Redis configurado
- [ ] Variáveis de ambiente setadas
- [ ] CORS_ORIGIN configurado para frontend
- [ ] Backend acessível via HTTPS

### Pós-Deploy:
- [ ] Testar registro de usuário
- [ ] Testar login
- [ ] Testar WebSocket (chat/duelos)
- [ ] Testar criação de deck
- [ ] Verificar logs de erro

---

## 🔧 Troubleshooting

### Erro: CORS bloqueado
**Solução**: Certifique-se que `CORS_ORIGIN` no backend tem a URL exata do frontend Vercel

### Erro: WebSocket não conecta
**Solução**: Use `wss://` (não `ws://`) para conexão segura em produção

### Erro: Database connection failed
**Solução**: Verifique se as URLs dos bancos estão corretas nas variáveis de ambiente

### Erro: Images não carregam
**Solução**: Configure AWS S3 ou Cloudinary para uploads em produção

---

## 💡 Recomendações

1. **Segurança**:
   - Use JWT_SECRET forte (mínimo 32 caracteres)
   - Ative HTTPS em todos os serviços
   - Configure rate limiting

2. **Performance**:
   - Use CDN para assets estáticos (Vercel já faz isso)
   - Configure Redis cache corretamente
   - Otimize imagens das cartas

3. **Monitoramento**:
   - Configure Sentry para tracking de erros
   - Use Vercel Analytics
   - Monitore logs do Railway/Render

4. **Backup**:
   - Configure backup automático dos bancos
   - Mantenha repositório Git atualizado

---

## 📞 Suporte

- **Vercel Docs**: https://vercel.com/docs
- **Railway Docs**: https://docs.railway.app
- **Render Docs**: https://render.com/docs

---

## 🎮 URLs de Exemplo

Após deploy:
- **Frontend**: https://yugioh-online.vercel.app
- **Backend**: https://yugioh-backend.railway.app
- **API Docs**: https://yugioh-backend.railway.app/api

Boa sorte com o deploy! 🚀
