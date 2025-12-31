# 🚀 Guia Completo: Deploy Backend no Fly.io

Fly.io é uma excelente opção para seu backend! Oferece:
- ✅ **3 VMs compartilhadas grátis** (suficiente para começar)
- ✅ **Escalabilidade fácil** (adicione mais VMs quando precisar)
- ✅ **Performance excelente** (edge network global)
- ✅ **PostgreSQL barato** ($1.94/mês)
- ✅ **Redis incluído** (grátis)
- ✅ **WebSocket suportado** nativamente
- ✅ **Deploy rápido** (2-3 minutos)

## 📋 Índice

1. [Por que Fly.io é Ideal](#por-que-fly-io)
2. [Pré-requisitos](#pré-requisitos)
3. [Instalação e Setup](#instalação)
4. [Configurar PostgreSQL](#postgresql)
5. [Configurar Redis](#redis)
6. [Deploy do Backend](#deploy-backend)
7. [Configurar Variáveis de Ambiente](#variáveis)
8. [Escalabilidade](#escalabilidade)
9. [Monitoramento](#monitoramento)
10. [Troubleshooting](#troubleshooting)

---

## 🎯 Por que Fly.io é Ideal para Seu Jogo

### Vantagens:

1. **Gratuito para Começar**: 3 VMs compartilhadas grátis
2. **Escalável**: Adicione VMs facilmente quando crescer
3. **Performance**: Edge network global = baixa latência
4. **WebSocket Nativo**: Suporta WebSocket perfeitamente (ideal para duelos)
5. **Barato**: PostgreSQL por apenas $1.94/mês
6. **Fácil Deploy**: Deploy em minutos
7. **Auto-scaling**: Pode configurar auto-scaling baseado em tráfego

### Capacidade:

- **Gratuito**: ~100-200 usuários simultâneos
- **Com 1 VM paga ($5/mês)**: ~500-1000 usuários simultâneos
- **Com 3 VMs pagas**: ~2000-5000 usuários simultâneos
- **Escalável até**: Milhares de usuários (adicione VMs conforme necessário)

---

## 📦 Pré-requisitos

1. **Conta no GitHub** (seu código já está lá)
2. **Conta no Fly.io** (grátis)
3. **Fly CLI instalado** (vamos instalar)
4. **Node.js local** (para testar antes de deploy)

---

## 🔧 Passo 1: Instalação e Setup

### 1.1 Criar Conta no Fly.io

1. **Acesse**: https://fly.io
2. **Sign Up** (grátis)
3. **Conecte com GitHub** (recomendado)
4. **Verifique email** se necessário

### 1.2 Instalar Fly CLI

**Windows (PowerShell):**
```powershell
# Baixe e instale via winget
winget install --id Fly.Flyctl

# Ou via PowerShell (como Admin)
iwr https://fly.io/install.ps1 -useb | iex
```

**Linux/Mac:**
```bash
curl -L https://fly.io/install.sh | sh
```

**Verificar instalação:**
```bash
flyctl version
```

### 1.3 Login no Fly.io

```bash
flyctl auth login
```

Isso abrirá o navegador para autenticar.

---

## 🗄️ Passo 2: Configurar PostgreSQL

### 2.1 Criar Banco PostgreSQL

```bash
# Criar PostgreSQL (plano mais barato)
flyctl postgres create --name yugioh-db --region gru  # ou outra região próxima

# Opções de região:
# gru = São Paulo, Brasil
# iad = Virginia, EUA
# sjc = San Jose, EUA
# lhr = London, UK
```

**Escolha o plano:**
- **Development** ($1.94/mês) - 256MB RAM, 3GB storage - **RECOMENDADO para começar**
- **Production** ($15/mês) - 1GB RAM, 10GB storage

### 2.2 Anotar Credenciais

Após criar, você verá algo como:
```
Postgres cluster yugioh-db created
  Username:    postgres
  Password:    [senha gerada]
  Hostname:    yugioh-db.fly.dev
  Proxy port:  5432
  Postgres port:  5433
```

**Anote essas informações!**

### 2.3 Criar Database

```bash
# Conectar ao PostgreSQL
flyctl postgres connect -a yugioh-db

# Dentro do psql, criar o database:
CREATE DATABASE yugioh;
\q
```

### 2.4 Obter Connection String

```bash
# Obter connection string interna (para usar no backend)
flyctl postgres connect -a yugioh-db

# A connection string será algo como:
# postgres://postgres:senha@yugioh-db.fly.dev:5432/yugioh?sslmode=require
```

---

## 🔴 Passo 3: Configurar Redis (Opcional)

Fly.io não oferece Redis gerenciado, mas você pode:

### Opção A: Upstash Redis (Gratuito - Recomendado)

1. **Acesse**: https://upstash.com
2. **Crie conta grátis**
3. **Create Database → Redis**
4. **Configure**:
   - Name: `yugioh-redis`
   - Region: Escolha mais próxima
   - Type: Regional
5. **Anote**:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### Opção B: Redis no Fly.io (Self-hosted)

```bash
# Criar app Redis
flyctl apps create yugioh-redis

# Criar Dockerfile para Redis (opcional, mais complexo)
```

**Recomendação**: Use Upstash (mais fácil e grátis).

---

## 🚀 Passo 4: Deploy do Backend

### 4.1 Preparar Projeto

Certifique-se de que você está na pasta do backend:

```bash
cd backend
```

### 4.2 Inicializar Fly.io no Projeto

```bash
# Inicializar Fly.io
flyctl launch

# Ele vai fazer perguntas:
# - App name? (ex: yugioh-backend)
# - Region? (escolha mais próxima, ex: gru para Brasil)
# - PostgreSQL? (escolha o que criamos: yugioh-db)
# - Redis? (não, vamos usar Upstash)
```

Isso criará um arquivo `fly.toml` com a configuração.

### 4.3 Configurar fly.toml

O arquivo `fly.toml` será criado. Edite-o para ficar assim:

```toml
app = "yugioh-backend"
primary_region = "gru"  # Sua região

[build]
  builder = "paketobuildpacks/builder:base"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

  [[http_service.checks]]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    timeout = "5s"
    path = "/api/docs"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256
```

### 4.4 Criar Dockerfile (Opcional, mas Recomendado)

Fly.io pode usar buildpacks automáticos, mas um Dockerfile é mais confiável.

**Criar `backend/Dockerfile`:**

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./
COPY tsconfig.json ./
COPY nest-cli.json ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY . .

# Build
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar apenas dependências de produção
RUN npm ci --only=production

# Copiar build do stage anterior
COPY --from=builder /app/dist ./dist

# Expor porta
EXPOSE 3000

# Comando de start
CMD ["npm", "run", "start:prod"]
```

### 4.5 Criar .dockerignore

**Criar `backend/.dockerignore`:**

```
node_modules
dist
.env
.env.local
.git
.gitignore
*.md
uploads
*.log
```

### 4.6 Deploy

```bash
# Deploy inicial
flyctl deploy

# Aguarde o build e deploy (2-5 minutos)
```

### 4.7 Verificar Deploy

```bash
# Ver status
flyctl status

# Ver logs
flyctl logs

# Abrir no navegador
flyctl open
```

---

## 🔐 Passo 5: Configurar Variáveis de Ambiente

### 5.1 Configurar Secrets (Variáveis Sensíveis)

```bash
# DATABASE_URL (conexão interna)
flyctl secrets set DATABASE_URL="postgres://postgres:senha@yugioh-db.fly.dev:5432/yugioh?sslmode=require"

# JWT_SECRET (gere uma chave forte)
flyctl secrets set JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"

# MongoDB (se usar)
flyctl secrets set MONGODB_URI="mongodb+srv://usuario:senha@cluster.mongodb.net/yugioh-chat"

# Redis (se usar Upstash)
flyctl secrets set REDIS_URL="redis://default:token@upstash-redis:6379"

# CORS_ORIGIN (URL do frontend)
flyctl secrets set CORS_ORIGIN="https://seu-frontend.vercel.app"

# Outras variáveis
flyctl secrets set JWT_EXPIRES_IN="7d"
flyctl secrets set MAX_FILE_SIZE="10485760"
flyctl secrets set HTTP_TIMEOUT="30000"
flyctl secrets set MAX_CONNECTIONS="2000"
flyctl secrets set LOG_LEVEL="info"
```

### 5.2 Verificar Secrets

```bash
# Listar todos os secrets
flyctl secrets list
```

### 5.3 Redeploy após Configurar Secrets

```bash
# Redeploy para aplicar secrets
flyctl deploy
```

---

## 📈 Passo 6: Escalabilidade

### 6.1 Escalar Manualmente

```bash
# Escalar para 2 VMs
flyctl scale count 2

# Escalar para 3 VMs
flyctl scale count 3

# Escalar com mais recursos
flyctl scale vm shared-cpu-2x --memory 512
```

### 6.2 Auto-scaling (Opcional)

Edite `fly.toml`:

```toml
[autoscaling]
  min_machines = 1
  max_machines = 5
  balance_multiplier = 1.5
```

### 6.3 Monitorar Performance

```bash
# Ver métricas
flyctl metrics

# Ver status detalhado
flyctl status
```

---

## 📊 Passo 7: Monitoramento

### 7.1 Logs em Tempo Real

```bash
# Ver logs
flyctl logs

# Seguir logs (como tail -f)
flyctl logs -a yugioh-backend
```

### 7.2 Dashboard Web

1. **Acesse**: https://fly.io/dashboard
2. **Selecione seu app**: `yugioh-backend`
3. **Veja métricas**: CPU, Memória, Requisições

### 7.3 Alertas (Opcional)

Configure alertas no dashboard para:
- CPU alto
- Memória alta
- Erros

---

## 🚨 Troubleshooting

### Problema: Deploy falha

**Solução:**
```bash
# Ver logs detalhados
flyctl logs

# Verificar build localmente
docker build -t test .
docker run -p 3000:3000 test

# Verificar fly.toml
flyctl config validate
```

### Problema: Backend não conecta ao PostgreSQL

**Solução:**
1. Verifique se `DATABASE_URL` está correto:
```bash
flyctl secrets list
```

2. Teste conexão:
```bash
flyctl postgres connect -a yugioh-db
```

3. Verifique se o database existe:
```sql
\l  -- listar databases
```

### Problema: WebSocket não funciona

**Solução:**
1. Fly.io suporta WebSocket nativamente
2. Verifique se a porta está correta (3000)
3. Use `wss://` no frontend (não `ws://`)
4. Verifique logs:
```bash
flyctl logs
```

### Problema: App "dorme" (auto_stop)

**Solução:**
No `fly.toml`, configure:
```toml
[http_service]
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
```

### Problema: Memória insuficiente

**Solução:**
```bash
# Escalar memória
flyctl scale vm shared-cpu-1x --memory 512

# Ou usar VM dedicada
flyctl scale vm performance-1x --memory 1024
```

---

## 💰 Custos Estimados

### Plano Gratuito (Para Começar):
- ✅ 3 VMs compartilhadas: **Grátis**
- ✅ PostgreSQL Development: **$1.94/mês**
- ✅ Redis (Upstash): **Grátis**
- **Total: ~$2/mês**

### Plano Escalável (1000+ usuários):
- ✅ 3 VMs compartilhadas: **Grátis**
- ✅ PostgreSQL Production: **$15/mês**
- ✅ Redis (Upstash): **Grátis**
- **Total: ~$15/mês**

### Plano Alta Performance (5000+ usuários):
- ✅ 5 VMs performance: **~$50/mês**
- ✅ PostgreSQL Production: **$15/mês**
- ✅ Redis (Upstash Pro): **$10/mês**
- **Total: ~$75/mês**

---

## ✅ Checklist Final

Antes de considerar deploy completo:

- [ ] Fly CLI instalado e logado
- [ ] PostgreSQL criado e database `yugioh` criado
- [ ] Redis configurado (Upstash ou self-hosted)
- [ ] `fly.toml` configurado corretamente
- [ ] Dockerfile criado (opcional, mas recomendado)
- [ ] Secrets configurados (DATABASE_URL, JWT_SECRET, etc.)
- [ ] Deploy realizado com sucesso
- [ ] Backend acessível via URL
- [ ] WebSocket conectando
- [ ] Logs sem erros críticos
- [ ] Testado com requisições reais

---

## 🎯 Comandos Úteis

```bash
# Deploy
flyctl deploy

# Ver status
flyctl status

# Ver logs
flyctl logs

# Abrir app
flyctl open

# SSH no container
flyctl ssh console

# Escalar
flyctl scale count 2

# Ver métricas
flyctl metrics

# Listar secrets
flyctl secrets list

# Adicionar secret
flyctl secrets set KEY=value

# Remover secret
flyctl secrets unset KEY

# Ver configuração
flyctl config show

# Restart app
flyctl apps restart yugioh-backend
```

---

## 📚 Recursos Adicionais

- **Fly.io Docs**: https://fly.io/docs
- **Fly.io PostgreSQL**: https://fly.io/docs/postgres
- **Fly.io Scaling**: https://fly.io/docs/scaling
- **Fly.io WebSocket**: https://fly.io/docs/reference/websockets

---

## 💡 Dicas Finais

1. **Comece com o plano gratuito** e escale quando necessário
2. **Use PostgreSQL Development** ($1.94/mês) para começar
3. **Configure auto-start** para evitar "cold start"
4. **Monitore logs** regularmente
5. **Use secrets** para variáveis sensíveis (nunca no código)
6. **Teste localmente** antes de cada deploy
7. **Configure backup** do PostgreSQL regularmente

---

**Boa sorte com o deploy no Fly.io! 🚀**

