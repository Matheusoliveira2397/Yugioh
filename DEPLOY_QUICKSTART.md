# 🚀 Deploy Rápido - Yu-Gi-Oh! Online

## 📦 Opção Mais Fácil: Frontend no Vercel + Backend no Railway

### **1️⃣ Deploy do Frontend no Vercel (5 minutos)**

```bash
# Entre na pasta do frontend
cd frontend

# Instale o Vercel CLI (se não tiver)
npm install -g vercel

# Login
vercel login

# Deploy!
vercel --prod
```

**Durante o deploy, responda:**
- Set up and deploy? → **Y**
- Link to existing project? → **N**  
- Project name? → **yugioh-online**
- Directory? → **./**
- Want to override settings? → **Y**
  - Build Command: `npm run build`
  - Output Directory: `dist`
  - Development Command: `npm run dev`

### **2️⃣ Deploy do Backend no Railway (10 minutos)**

1. **Acesse**: https://railway.app
2. **Login com GitHub**
3. **New Project** → **Deploy from GitHub repo**
4. **Selecione**: Matheusoliveira2397/Yugioh
5. **Adicione os bancos**:
   - Click em **+ New** → **Database** → **Add PostgreSQL**
   - Click em **+ New** → **Database** → **Add MongoDB**
   - Click em **+ New** → **Database** → **Add Redis**

6. **Configure Variáveis** (Settings → Variables):
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}
MONGODB_URI=${{MongoDB.MONGO_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=yugioh_super_secret_key_production_2024
CORS_ORIGIN=https://seu-app.vercel.app
```

7. **Deploy automático** acontecerá!
8. **Copie a URL** do backend (ex: `yugioh-production.up.railway.app`)

### **3️⃣ Conectar Frontend ao Backend**

No dashboard do **Vercel**:
1. Vá em **Settings** → **Environment Variables**
2. Adicione:
```
VITE_API_URL = https://yugioh-production.up.railway.app
VITE_WS_URL = wss://yugioh-production.up.railway.app
```
3. **Redeploy** o frontend (Deployments → ... → Redeploy)

---

## ✅ Pronto!

Seu jogo estará online em:
- **Frontend**: https://seu-app.vercel.app
- **Backend**: https://yugioh-production.up.railway.app

---

## 🆓 Custos

- **Vercel**: Grátis (até 100GB bandwidth)
- **Railway**: $5/mês de crédito grátis (suficiente para começar)

---

## ❓ Problemas?

**CORS Error?**
→ Verifique se `CORS_ORIGIN` no Railway está correto

**WebSocket não conecta?**
→ Use `wss://` (não `ws://`)

**Build falhou no Vercel?**
→ Certifique-se que está na pasta `frontend`

Para mais detalhes, veja `DEPLOY_GUIDE.md`
