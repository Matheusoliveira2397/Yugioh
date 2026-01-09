# 🚀 Guia Completo de Deploy Gratuito/Barato - Yu-Gi-Oh! Online

Este guia detalhado mostra como fazer deploy completo do seu jogo em servidores gratuitos ou muito baratos, suportando múltiplos usuários ativos.

## 📋 Índice

1. [Visão Geral da Arquitetura](#visão-geral)
2. [Opções de Serviços Gratuitos/Baratos](#opções-de-serviços)
3. [Setup Completo Passo a Passo](#setup-completo)
4. [Configuração de Bancos de Dados](#bancos-de-dados)
5. [Deploy do Backend](#deploy-backend)
6. [Deploy do Frontend](#deploy-frontend)
7. [Configuração de Domínio e SSL](#domínio-ssl)
8. [Monitoramento e Manutenção](#monitoramento)

---

## 🏗️ Visão Geral da Arquitetura

Seu jogo precisa de:

- **Backend**: NestJS (Node.js) - Porta 3000
- **Frontend**: React (Vite) - Build estático
- **PostgreSQL**: Banco de dados principal (obrigatório)
- **MongoDB**: Chat (opcional, mas recomendado)
- **Redis**: Cache e filas (opcional, mas recomendado)
- **WebSocket**: Para duelos em tempo real

---

## 💰 Opções de Serviços Gratuitos/Baratos

### 🥇 Opção 1: Render.com (RECOMENDADO - Mais Fácil)

**Gratuito:**
- Backend: 750 horas/mês grátis (suficiente para 24/7)
- Frontend: Site estático grátis ilimitado
- PostgreSQL: 90 dias grátis, depois $7/mês
- Redis: $10/mês (ou use alternativas gratuitas)

**Vantagens:**
- ✅ Setup automático
- ✅ SSL automático
- ✅ Deploy automático via GitHub
- ✅ Muito fácil de usar

### 🥈 Opção 2: Railway.app

**Gratuito:**
- $5 grátis/mês (créditos)
- PostgreSQL incluído
- Redis incluído

**Vantagens:**
- ✅ Tudo em um lugar
- ✅ Setup rápido
- ✅ Escala automaticamente

### 🥉 Opção 3: Fly.io

**Gratuito:**
- 3 VMs compartilhadas grátis
- PostgreSQL: $1.94/mês
- Redis: Incluído

**Vantagens:**
- ✅ Muito barato
- ✅ Performance boa
- ✅ Global edge network

### 🏅 Opção 4: Supabase + Vercel (Mais Barato)

**Gratuito:**
- Supabase: PostgreSQL grátis (500MB)
- Vercel: Frontend grátis ilimitado
- Backend: Railway ou Fly.io ($5/mês)

**Vantagens:**
- ✅ PostgreSQL grátis
- ✅ Frontend grátis
- ✅ Backend muito barato

---

## 🎯 Setup Completo Passo a Passo

Vou usar a **Opção 1 (Render.com)** como exemplo, pois é a mais fácil. Mas os passos são similares para outras plataformas.

---

## 📦 Passo 1: Preparar o Código

### 1.1 Verificar Estrutura do Projeto

Certifique-se de que seu projeto está assim:

```
Yugioh/
├── backend/
│   ├── src/
│   ├── package.json
│   └── .env (não commitar!)
├── frontend/
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

### 1.2 Criar Arquivos de Build

**Backend - Criar `backend/build.sh`:**

```bash
#!/bin/bash
npm install
npm run build
```

**Backend - Criar `backend/start.sh`:**

```bash
#!/bin/bash
npm run start:prod
```

**Frontend - Verificar `frontend/package.json` tem:**

```json
{
  "scripts": {
    "build": "vite build"
  }
}
```

### 1.3 Preparar Variáveis de Ambiente

Crie um arquivo `backend/.env.example` (já deve existir) com todas as variáveis necessárias.

---

## 🗄️ Passo 2: Configurar Bancos de Dados

### 2.1 PostgreSQL no Render.com

1. **Acesse**: https://render.com
2. **Crie conta** (grátis com GitHub)
3. **New + → PostgreSQL**
4. **Configure**:
   - **Name**: `yugioh-db`
   - **Database**: `yugioh`
   - **User**: (gerado automaticamente)
   - **Region**: Escolha mais próxima (ex: `Oregon (US West)`)
   - **PostgreSQL Version**: `15` ou `16`
   - **Plan**: `Free` (90 dias) ou `Starter` ($7/mês)

5. **Anote as credenciais**:
   - Internal Database URL (para usar no backend)
   - External Database URL (para conectar localmente)
   - Host, Port, Database, User, Password

### 2.2 MongoDB (Opcional - para Chat)

**Opção A: MongoDB Atlas (Gratuito)**

1. **Acesse**: https://www.mongodb.com/cloud/atlas
2. **Crie conta grátis**
3. **Create Cluster → Free (M0)**
4. **Configure**:
   - **Cloud Provider**: AWS
   - **Region**: Escolha mais próxima
   - **Cluster Name**: `yugioh-chat`
5. **Create Database User**:
   - Username: `yugioh-user`
   - Password: (gere uma senha forte)
6. **Network Access**:
   - Add IP Address → `0.0.0.0/0` (permitir de qualquer lugar)
7. **Anote a Connection String**:
   - Formato: `mongodb+srv://usuario:senha@cluster.mongodb.net/yugioh-chat`

**Opção B: Render.com MongoDB**

1. **New + → MongoDB**
2. **Configure** similar ao PostgreSQL
3. **Anote a Connection String**

### 2.3 Redis (Opcional - para Cache)

**Opção A: Upstash (Gratuito)**

1. **Acesse**: https://upstash.com
2. **Crie conta grátis**
3. **Create Database → Redis**
4. **Configure**:
   - **Name**: `yugioh-redis`
   - **Region**: Escolha mais próxima
   - **Type**: Regional
5. **Anote**:
   - **UPSTASH_REDIS_REST_URL**
   - **UPSTASH_REDIS_REST_TOKEN**

**Opção B: Render.com Redis**

1. **New + → Redis**
2. **Plan**: `Free` (limitado) ou `Starter` ($10/mês)
3. **Anote a Connection String**

---

## 🖥️ Passo 3: Deploy do Backend

### 3.1 Preparar Backend para Render.com

**Criar `backend/render.yaml` (opcional, mas recomendado):**

```yaml
services:
  - type: web
    name: yugioh-backend
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm run start:prod
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3000
      - key: DATABASE_URL
        sync: false  # Vai pedir para você preencher
      - key: MONGODB_URI
        sync: false
      - key: REDIS_URL
        sync: false
      - key: JWT_SECRET
        generateValue: true  # Gera automaticamente
      - key: CORS_ORIGIN
        sync: false  # URL do frontend
```

### 3.2 Deploy Manual no Render.com

1. **Acesse Render Dashboard**
2. **New + → Web Service**
3. **Connect GitHub** (se ainda não conectou)
4. **Selecione seu repositório**: `Yugioh`
5. **Configure**:
   - **Name**: `yugioh-backend`
   - **Environment**: `Node`
   - **Region**: Mesma do PostgreSQL
   - **Branch**: `Developer` (ou sua branch principal)
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start:prod`

6. **Environment Variables** (adicionar):
   ```
   NODE_ENV=production
   PORT=3000
   DATABASE_URL=<cole a Internal Database URL do PostgreSQL>
   MONGODB_URI=<cole a connection string do MongoDB>
   REDIS_URL=<cole a URL do Redis>
   JWT_SECRET=<gere uma chave: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
   CORS_ORIGIN=https://seu-frontend.onrender.com
   ```

7. **Advanced → Health Check Path**: `/api/docs` (opcional)

8. **Create Web Service**

9. **Aguarde o deploy** (5-10 minutos na primeira vez)

10. **Anote a URL**: `https://yugioh-backend.onrender.com`

### 3.3 Verificar Backend

1. Acesse: `https://seu-backend.onrender.com/api/docs`
2. Deve mostrar a documentação Swagger
3. Teste um endpoint simples

---

## 🎨 Passo 4: Deploy do Frontend

### 4.1 Preparar Frontend

**Criar `frontend/render.yaml` (opcional):**

```yaml
services:
  - type: web
    name: yugioh-frontend
    env: static
    buildCommand: npm install && npm run build
    staticPublishPath: ./dist
    envVars:
      - key: VITE_API_URL
        value: https://seu-backend.onrender.com
      - key: VITE_WS_URL
        value: wss://seu-backend.onrender.com
```

### 4.2 Deploy no Render.com (Static Site)

1. **New + → Static Site**
2. **Connect GitHub**
3. **Selecione repositório**: `Yugioh`
4. **Configure**:
   - **Name**: `yugioh-frontend`
   - **Branch**: `Developer`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`

5. **Environment Variables**:
   ```
   VITE_API_URL=https://seu-backend.onrender.com
   VITE_WS_URL=wss://seu-backend.onrender.com
   ```

6. **Create Static Site**

7. **Aguarde o build** (3-5 minutos)

8. **Anote a URL**: `https://yugioh-frontend.onrender.com`

### 4.3 Alternativa: Vercel (Gratuito e Mais Rápido)

**Vercel é melhor para frontend React:**

1. **Acesse**: https://vercel.com
2. **Crie conta** (grátis com GitHub)
3. **New Project**
4. **Import Git Repository**: Selecione `Yugioh`
5. **Configure**:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

6. **Environment Variables**:
   ```
   VITE_API_URL=https://seu-backend.onrender.com
   VITE_WS_URL=wss://seu-backend.onrender.com
   ```

7. **Deploy**

8. **URL gerada**: `https://yugioh-frontend.vercel.app`

---

## 🌐 Passo 5: Configurar Domínio e SSL

### 5.1 Comprar Domínio (Opcional)

**Opções baratas:**
- **Namecheap**: ~$10/ano (.com)
- **Cloudflare Registrar**: Preço de custo
- **Freenom**: Grátis (.tk, .ml, .ga) - não recomendado para produção

### 5.2 Configurar Domínio no Render.com

**Backend:**
1. **Settings → Custom Domain**
2. **Add Domain**: `api.seudominio.com`
3. **Siga as instruções DNS**:
   - Tipo: `CNAME`
   - Nome: `api`
   - Valor: `yugioh-backend.onrender.com`

**Frontend:**
1. **Settings → Custom Domain**
2. **Add Domain**: `seudominio.com` e `www.seudominio.com`
3. **Configure DNS** similar

### 5.3 SSL Automático

Render.com e Vercel configuram SSL automaticamente quando você adiciona domínio customizado.

**Aguarde 1-24 horas** para propagação DNS e ativação SSL.

### 5.4 Atualizar Variáveis de Ambiente

**Backend - Atualizar `CORS_ORIGIN`:**
```
CORS_ORIGIN=https://seudominio.com
```

**Frontend - Atualizar URLs:**
```
VITE_API_URL=https://api.seudominio.com
VITE_WS_URL=wss://api.seudominio.com
```

**Redeploy** ambos os serviços.

---

## 🔧 Passo 6: Configurações Adicionais

### 6.1 Configurar WebSocket no Render.com

Render.com suporta WebSocket automaticamente, mas você precisa:

1. **Backend Settings → Health Check**:
   - Desabilitar ou usar endpoint que não bloqueia

2. **Verificar se WebSocket funciona**:
   - Abra console do navegador
   - Deve ver: `✅ Socket conectado`

### 6.2 Configurar Auto-Deploy

**Render.com:**
- Auto-deploy está ativado por padrão
- Toda vez que você faz push na branch configurada, faz deploy automático

**Vercel:**
- Auto-deploy também automático
- Pode configurar preview deployments

### 6.3 Configurar Variáveis de Ambiente Sensíveis

**NUNCA commite**:
- `.env`
- `.env.local`
- `.env.production`

**Sempre use** variáveis de ambiente do serviço de deploy.

---

## 📊 Passo 7: Monitoramento Básico

### 7.1 Render.com Dashboard

- **Metrics**: CPU, Memória, Requisições
- **Logs**: Logs em tempo real
- **Events**: Histórico de deploys

### 7.2 Uptime Monitoring (Gratuito)

**UptimeRobot:**
1. **Acesse**: https://uptimerobot.com
2. **Crie conta grátis**
3. **Add New Monitor**:
   - **Type**: HTTP(s)
   - **URL**: `https://seu-backend.onrender.com/api/docs`
   - **Interval**: 5 minutos
4. **Receba alertas** se o servidor cair

### 7.3 Logs e Debugging

**Render.com:**
- **Logs tab**: Veja logs em tempo real
- **Download logs**: Para análise

**Vercel:**
- **Deployments → View Function Logs**

---

## 💰 Custos Estimados

### Opção Gratuita (90 dias):
- ✅ Backend: Grátis (Render.com)
- ✅ Frontend: Grátis (Vercel)
- ✅ PostgreSQL: Grátis (90 dias no Render)
- ✅ MongoDB: Grátis (Atlas)
- ✅ Redis: Grátis (Upstash)
- ✅ Domínio: Opcional
- **Total: $0/mês (primeiros 90 dias)**

### Opção Barata (Após 90 dias):
- ✅ Backend: Grátis (Render.com)
- ✅ Frontend: Grátis (Vercel)
- ✅ PostgreSQL: $7/mês (Render Starter)
- ✅ MongoDB: Grátis (Atlas)
- ✅ Redis: Grátis (Upstash)
- ✅ Domínio: $10/ano (~$0.83/mês)
- **Total: ~$8/mês**

### Opção Escalável:
- ✅ Backend: $7/mês (Render Starter)
- ✅ Frontend: Grátis (Vercel)
- ✅ PostgreSQL: $7/mês
- ✅ MongoDB: Grátis (Atlas)
- ✅ Redis: $10/mês (Render)
- ✅ Domínio: $10/ano
- **Total: ~$24/mês**

---

## 🚨 Troubleshooting

### Problema: Backend não conecta ao banco

**Solução:**
1. Verifique se `DATABASE_URL` está correto
2. Use **Internal Database URL** (não External)
3. Verifique se PostgreSQL está rodando
4. Verifique firewall/network access

### Problema: CORS Error

**Solução:**
1. Verifique `CORS_ORIGIN` no backend
2. Certifique-se de que é exatamente a URL do frontend
3. Sem trailing slash (`/`)
4. Redeploy o backend após alterar

### Problema: WebSocket não conecta

**Solução:**
1. Use `wss://` (não `ws://`) em produção
2. Verifique se Render.com suporta WebSocket (suporta)
3. Verifique logs do backend
4. Teste localmente primeiro

### Problema: Build falha

**Solução:**
1. Verifique logs de build
2. Certifique-se de que `package.json` tem todos os scripts
3. Verifique se todas as dependências estão em `package.json`
4. Teste build localmente: `npm run build`

### Problema: Servidor "dorme" (Render.com Free)

**Solução:**
- Render.com Free "dorme" após 15 minutos de inatividade
- Primeira requisição após dormir leva ~30 segundos
- **Solução**: Upgrade para Starter ($7/mês) ou use UptimeRobot para manter acordado

---

## ✅ Checklist Final

Antes de considerar deploy completo:

- [ ] PostgreSQL configurado e acessível
- [ ] MongoDB configurado (se usar chat)
- [ ] Redis configurado (se usar cache)
- [ ] Backend deployado e funcionando
- [ ] Frontend deployado e funcionando
- [ ] WebSocket conectando
- [ ] Login funcionando
- [ ] Duelos funcionando
- [ ] Domínio configurado (opcional)
- [ ] SSL ativo (automático)
- [ ] Monitoramento configurado
- [ ] Variáveis de ambiente todas configuradas
- [ ] Testado com múltiplos usuários

---

## 🎯 Próximos Passos

1. **Teste tudo localmente primeiro**
2. **Faça deploy de um serviço por vez**
3. **Teste cada serviço isoladamente**
4. **Configure domínio depois que tudo estiver funcionando**
5. **Configure monitoramento**
6. **Documente suas URLs e credenciais** (em local seguro!)

---

## 📚 Recursos Adicionais

- **Render.com Docs**: https://render.com/docs
- **Vercel Docs**: https://vercel.com/docs
- **Supabase Docs**: https://supabase.com/docs
- **MongoDB Atlas Docs**: https://docs.atlas.mongodb.com

---

## 💡 Dicas Finais

1. **Comece simples**: Deploy backend primeiro, depois frontend
2. **Teste localmente**: Sempre teste antes de fazer deploy
3. **Use variáveis de ambiente**: Nunca hardcode credenciais
4. **Monitore logs**: Sempre verifique logs quando algo não funciona
5. **Backup**: Configure backup automático do PostgreSQL
6. **Escale gradualmente**: Comece grátis, escale quando necessário

---

**Boa sorte com o deploy! 🚀**


