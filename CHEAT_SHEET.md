# ⚡ Comandos Rápidos - Cheat Sheet

## 🚀 Deploy Rápido (Tudo em 3 Comandos)

```powershell
# 1. Preparar builds
.\prepare-production.ps1

# 2. Commit e push
git add . ; git commit -m "deploy: Production ready" ; git push origin main

# 3. Deploy (automático)
.\deploy-all.ps1
```

---

## 🐙 Git

```bash
# Status
git status

# Add todos os arquivos
git add .

# Commit
git commit -m "sua mensagem"

# Push
git push origin main

# Pull
git pull origin main

# Ver histórico
git log --oneline

# Desfazer último commit (mantém mudanças)
git reset --soft HEAD~1

# Desfazer último commit (descarta mudanças)
git reset --hard HEAD~1
```

---

## 🐳 Docker

```powershell
# Iniciar todos os serviços
docker-compose up -d

# Ver logs
docker-compose logs -f

# Ver logs de um serviço específico
docker-compose logs -f backend

# Parar todos os serviços
docker-compose down

# Reconstruir imagens
docker-compose up -d --build

# Reiniciar um serviço
docker-compose restart backend

# Ver containers rodando
docker ps

# Limpar tudo (cuidado!)
docker-compose down -v
docker system prune -a
```

---

## ☁️ Vercel

```bash
# Instalar CLI
npm install -g vercel

# Login
vercel login

# Deploy de desenvolvimento
vercel

# Deploy de produção
vercel --prod

# Ver deployments
vercel ls

# Ver logs
vercel logs

# Remover projeto
vercel remove
```

---

## 🚂 Railway

```bash
# Instalar CLI
npm install -g @railway/cli

# Login
railway login

# Linkar projeto
railway link

# Deploy
railway up

# Ver logs
railway logs

# Variáveis de ambiente
railway variables

# Abrir dashboard
railway open
```

---

## 📦 NPM

```bash
# Instalar dependências
npm install

# Instalar e salvar como dependência
npm install --save pacote

# Instalar e salvar como dev dependency
npm install --save-dev pacote

# Atualizar dependências
npm update

# Remover pacote
npm uninstall pacote

# Limpar cache
npm cache clean --force

# Verificar vulnerabilidades
npm audit

# Corrigir vulnerabilidades
npm audit fix
```

---

## 🔨 Build e Run

### Frontend
```bash
cd frontend

# Desenvolvimento
npm run dev

# Build
npm run build

# Preview do build
npm run preview

# Lint
npm run lint
```

### Backend
```bash
cd backend

# Desenvolvimento
npm run start:dev

# Build
npm run build

# Produção
npm run start:prod

# Testes
npm run test
```

---

## 🗄️ Database (PostgreSQL)

```bash
# Conectar via Docker
docker exec -it yugioh-postgres psql -U yugioh_user -d yugioh_db

# Ou via Railway
psql postgresql://user:pass@host:port/db

# Comandos no psql
\dt                  # Listar tabelas
\d users             # Descrever tabela
SELECT * FROM users; # Query
\q                   # Sair
```

### Queries Úteis
```sql
-- Ver todos os usuários
SELECT id, nickname, email, role, rating FROM users;

-- Promover a admin
UPDATE users SET role = 'MASTER' WHERE email = 'seu@email.com';

-- Ver decks
SELECT * FROM decks;

-- Ver cartas na loja
SELECT * FROM shop_items;

-- Limpar tabela (cuidado!)
TRUNCATE TABLE nome_tabela CASCADE;
```

---

## 🍃 MongoDB

```bash
# Conectar via Docker
docker exec -it yugioh-mongodb mongosh -u yugioh_user -p yugioh_password --authenticationDatabase admin

# Comandos no mongosh
use yugioh_chat          // Usar database
show collections         // Listar collections
db.messages.find()       // Ver mensagens
db.messages.countDocuments() // Contar
exit                     // Sair
```

---

## 🔴 Redis

```bash
# Conectar via Docker
docker exec -it yugioh-redis redis-cli

# Comandos no redis-cli
PING                # Testar conexão
KEYS *              # Ver todas as chaves
GET chave           # Pegar valor
SET chave valor     # Setar valor
DEL chave           # Deletar chave
FLUSHALL            # Limpar tudo (cuidado!)
exit                # Sair
```

---

## 🔍 Debug

### Ver logs do Backend
```bash
# Docker
docker-compose logs -f backend | Select-String "error"

# Local
npm run start:dev
```

### Ver erros do Frontend
```javascript
// No navegador (F12 → Console)
// Filtrar por: "error"
```

### Testar API
```bash
# Health check
curl http://localhost:3000/health

# Registro
curl -X POST http://localhost:3000/auth/register `
  -H "Content-Type: application/json" `
  -d '{\"nickname\":\"Test\",\"email\":\"test@test.com\",\"password\":\"123456\"}'

# Login
curl -X POST http://localhost:3000/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"test@test.com\",\"password\":\"123456\"}'
```

---

## 🛠️ Troubleshooting Rápido

### Frontend não carrega
```bash
cd frontend
npm install
npm run build
npm run preview
```

### Backend não conecta
```bash
# Verifique .env
cat backend/.env

# Reinicie o Docker
docker-compose restart backend
```

### Database não conecta
```bash
# Verifique se está rodando
docker ps

# Reinicie
docker-compose restart postgres mongodb redis
```

### WebSocket não funciona
```bash
# Verifique CORS
# backend/src/main.ts deve ter:
# app.enableCors({ origin: 'http://localhost:5173', credentials: true })
```

---

## 📊 Monitoramento

### Ver uso de recursos
```bash
# Docker
docker stats

# Sistema
# Windows
Get-Process | Sort-Object CPU -Descending | Select-Object -First 10

# Linux/Mac
top
```

### Espaço em disco
```bash
# Windows
Get-PSDrive

# Linux/Mac
df -h
```

---

## 🧹 Limpeza

```bash
# Limpar node_modules
Remove-Item -Recurse -Force frontend/node_modules, backend/node_modules

# Limpar builds
Remove-Item -Recurse -Force frontend/dist, backend/dist

# Limpar Docker
docker-compose down -v
docker system prune -a --volumes

# Limpar cache npm
npm cache clean --force
```

---

## 🔐 Segurança

### Gerar JWT Secret
```powershell
# Windows (PowerShell)
-join ((33..126) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

```bash
# Linux/Mac
openssl rand -base64 32
```

### Criar senha de aplicativo (Gmail)
1. Google Account → Segurança
2. Verificação em 2 etapas → Ativar
3. Senhas de app → Criar

---

## 📱 URLs Úteis

### Desenvolvimento Local
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3000
- **PostgreSQL**: localhost:5432
- **MongoDB**: localhost:27017
- **Redis**: localhost:6379

### Produção (Exemplo)
- **Frontend Vercel**: https://seu-app.vercel.app
- **Backend Railway**: https://seu-backend.railway.app
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Railway Dashboard**: https://railway.app/dashboard

### Documentação
- **Vercel Docs**: https://vercel.com/docs
- **Railway Docs**: https://docs.railway.app
- **NestJS Docs**: https://docs.nestjs.com
- **React Docs**: https://react.dev

---

## 🎯 Atalhos do VS Code

```
Ctrl+Shift+P    - Command Palette
Ctrl+P          - Quick Open
Ctrl+`          - Terminal
Ctrl+B          - Toggle Sidebar
Ctrl+Shift+F    - Search
Ctrl+Shift+H    - Replace
F5              - Debug
Ctrl+Shift+D    - Debug View
```

---

## 📋 Checklist de Deploy

```
✅ Build local funciona
✅ Testes passam
✅ .env.example atualizado
✅ Commit e push no Git
✅ Frontend no Vercel
✅ Backend no Railway
✅ Databases criadas
✅ Env vars configuradas
✅ Health check OK
✅ Frontend carrega
✅ Registro funciona
✅ Login funciona
✅ WebSocket conecta
✅ Admin criado
```

---

<div align="center">

**⚡ Salve este arquivo para referência rápida! 📌**

</div>
