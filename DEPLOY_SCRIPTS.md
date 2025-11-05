# 🚀 Scripts de Deploy Automatizado

## 📦 1. Deploy Local para Produção

### Windows (PowerShell)
```powershell
# Execute este script para preparar o projeto
.\prepare-production.ps1
```

### Linux/Mac (Bash)
```bash
# Torne o script executável
chmod +x prepare-production.sh

# Execute
./prepare-production.sh
```

---

## 🐙 2. Commit e Push para GitHub

### Script Completo
```powershell
# Windows PowerShell
cd c:\Yugioh

# Adicionar todos os arquivos
git add .

# Commit com mensagem descritiva
git commit -m "feat: Add deployment configuration and documentation

- Added Vercel configuration (vercel.json)
- Added Railway configuration (railway.json)
- Created comprehensive deployment guides
- Added production build scripts
- Updated README with deployment instructions
- Added post-deploy validation guide
"

# Push para o repositório
git push origin main
```

### Versão Simplificada
```powershell
git add .
git commit -m "Add deployment configuration and guides"
git push origin main
```

---

## ☁️ 3. Deploy no Vercel (Frontend)

### Via CLI (Recomendado)
```bash
# Instalar Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy de produção (na pasta frontend)
cd frontend
vercel --prod
```

### Via Web (Alternativa)
1. Acesse: https://vercel.com/dashboard
2. Clique em **Add New** → **Project**
3. Import do GitHub: `Matheusoliveira2397/Yugioh`
4. **Root Directory**: `frontend`
5. **Framework Preset**: Vite
6. **Environment Variables**:
   ```
   VITE_API_URL = (deixar vazio por enquanto)
   VITE_WS_URL = (deixar vazio por enquanto)
   ```
7. Clique em **Deploy**

---

## 🚂 4. Deploy no Railway (Backend)

### Via Web (Recomendado)
1. Acesse: https://railway.app/dashboard
2. Clique em **New Project**
3. Selecione **Deploy from GitHub repo**
4. Escolha: `Matheusoliveira2397/Yugioh`
5. Railway detectará automaticamente o `railway.json`

### Adicionar Databases
1. No projeto, clique em **New** → **Database**
2. Adicione:
   - ✅ **PostgreSQL**
   - ✅ **MongoDB**  
   - ✅ **Redis**

### Configurar Variáveis de Ambiente
1. Clique no serviço do **backend**
2. Vá em **Variables**
3. Adicione:

```bash
# Servidor
NODE_ENV=production
PORT=3000

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production-12345
JWT_EXPIRATION=7d

# CORS (IMPORTANTE: Atualizar após deploy no Vercel)
CORS_ORIGIN=https://seu-app.vercel.app
FRONTEND_URL=https://seu-app.vercel.app

# PostgreSQL (Railway gera automaticamente)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# MongoDB (Railway gera automaticamente)
MONGO_URI=${{MongoDB.MONGO_URL}}

# Redis (Railway gera automaticamente)
REDIS_URL=${{Redis.REDIS_URL}}

# Email (opcional - configure se quiser envio de emails)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=seu-email@gmail.com
MAIL_PASSWORD=sua-senha-de-aplicativo
MAIL_FROM=Yu-Gi-Oh Online <seu-email@gmail.com>
```

4. Clique em **Deploy**

---

## 🔗 5. Conectar Frontend e Backend

### Após Railway Deploy
1. Copie a URL do backend (ex: `https://seu-backend.railway.app`)
2. Volte ao **Vercel Dashboard**
3. Seu projeto → **Settings** → **Environment Variables**
4. Adicione/Atualize:
   ```
   VITE_API_URL = https://seu-backend.railway.app
   VITE_WS_URL = https://seu-backend.railway.app
   ```
5. Vá em **Deployments** → **Redeploy**

### Atualizar CORS no Railway
1. Railway Dashboard → Backend → Variables
2. Atualize:
   ```
   CORS_ORIGIN = https://seu-app.vercel.app
   FRONTEND_URL = https://seu-app.vercel.app
   ```
3. Redeploy automático

---

## 🧪 6. Validar Deploy

### Teste Rápido
```bash
# Teste o backend
curl https://seu-backend.railway.app/health

# Deve retornar:
# {"status":"ok","timestamp":"..."}

# Teste o frontend
curl https://seu-app.vercel.app

# Deve retornar o HTML da página
```

### Teste Completo
Siga o guia: [POST_DEPLOY_GUIDE.md](./POST_DEPLOY_GUIDE.md)

---

## 📋 Checklist de Deploy

### Antes do Deploy
- [ ] Build local funciona sem erros (`.\prepare-production.ps1`)
- [ ] Todos os testes passam
- [ ] Arquivos `.env.example` estão atualizados
- [ ] Documentação está completa

### Durante o Deploy
- [ ] Código commitado e pushado para GitHub
- [ ] Frontend deployado no Vercel
- [ ] Backend deployado no Railway
- [ ] Databases criadas (PostgreSQL, MongoDB, Redis)
- [ ] Variáveis de ambiente configuradas

### Após o Deploy
- [ ] Health check do backend funcionando
- [ ] Frontend carrega sem erros
- [ ] Registro de usuário funciona
- [ ] Login funciona
- [ ] WebSocket conecta
- [ ] Chat em tempo real funciona
- [ ] Primeiro admin criado
- [ ] Cartas adicionadas ao sistema

---

## 🔄 Redeployment (Atualizações Futuras)

### Atualizar Frontend
```bash
# Faça suas mudanças
cd frontend
# ... edições ...

# Commit e push
git add .
git commit -m "update: Frontend improvements"
git push origin main

# Vercel redeploya automaticamente!
```

### Atualizar Backend
```bash
# Faça suas mudanças
cd backend
# ... edições ...

# Commit e push
git add .
git commit -m "update: Backend improvements"
git push origin main

# Railway redeploya automaticamente!
```

### Rollback (se algo der errado)
#### Vercel
1. Dashboard → Deployments
2. Encontre o deploy anterior que funcionava
3. Clique nos 3 pontinhos → **Promote to Production**

#### Railway
1. Dashboard → Deployments
2. Encontre o deploy anterior
3. Clique em **Redeploy**

---

## 🆘 Troubleshooting Rápido

### Frontend não carrega
```bash
# Verifique build
cd frontend
npm run build

# Se der erro, corrija e faça redeploy
vercel --prod
```

### Backend retorna 500
```bash
# Verifique logs
railway logs --follow

# Procure por erros e corrija
# Redeploy automático ao dar push
```

### Database não conecta
```bash
# Railway: Verifique se as databases estão "Running"
# Verifique se as variáveis ${{Postgres.DATABASE_URL}} estão corretas
```

---

## 📞 Suporte

### Documentação
- [DEPLOY_QUICKSTART.md](./DEPLOY_QUICKSTART.md) - Guia rápido de 5 minutos
- [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) - Guia completo detalhado
- [POST_DEPLOY_GUIDE.md](./POST_DEPLOY_GUIDE.md) - Validação pós-deploy
- [QUICK_GUIDE.md](./QUICK_GUIDE.md) - Guia visual do projeto

### Links Úteis
- **Vercel Docs**: https://vercel.com/docs
- **Railway Docs**: https://docs.railway.app
- **GitHub Issues**: https://github.com/Matheusoliveira2397/Yugioh/issues

---

## 🎯 Script All-in-One (Deploy Completo)

```powershell
# Script para deploy completo (Windows PowerShell)

# 1. Preparar para produção
Write-Host "🔨 Preparando para produção..." -ForegroundColor Cyan
.\prepare-production.ps1

# 2. Commit e push
Write-Host "`n🐙 Enviando para GitHub..." -ForegroundColor Cyan
git add .
git commit -m "deploy: Production deployment with full configuration"
git push origin main

# 3. Deploy frontend
Write-Host "`n☁️ Deployando frontend no Vercel..." -ForegroundColor Cyan
cd frontend
vercel --prod

# 4. Instruções para Railway
Write-Host "`n🚂 Próximo passo: Deploy do Backend no Railway" -ForegroundColor Yellow
Write-Host "1. Acesse: https://railway.app/dashboard"
Write-Host "2. New Project → Deploy from GitHub"
Write-Host "3. Adicione PostgreSQL, MongoDB e Redis"
Write-Host "4. Configure as variáveis de ambiente"
Write-Host "5. Copie a URL do backend"
Write-Host "6. Volte ao Vercel e atualize VITE_API_URL e VITE_WS_URL"
Write-Host "`n✅ Deploy iniciado! Siga o POST_DEPLOY_GUIDE.md para validação" -ForegroundColor Green
```

Salve como `deploy-all.ps1` e execute:
```powershell
.\deploy-all.ps1
```

---

<div align="center">

**🚀 Boa sorte com o deploy! 🎮**

</div>
