# O que foi feito para o ambiente local ficar igual ao de produção

Este documento explica **tudo** que existe para você rodar o projeto localmente com as **mesmas características** de produção, e **por que** cada parte deixa o ambiente igual.

---

## 1. Visão geral

Em **produção** você tem (ou terá):

- **Backend** no Fly.io: build com `Dockerfile`, `NODE_ENV=production`, Postgres, Redis, variáveis via `fly secrets`.
- **Frontend** em Vercel/Render ou similar: build com `Dockerfile` (ou pipeline), arquivos estáticos servidos por CDN/nginx.
- **Bancos**: Postgres, MongoDB, Redis (Fly, Atlas, Upstash, etc.).

No **local “igual produção”**:

- Os **mesmos Dockerfiles** são usados (não os de dev).
- **NODE_ENV=production** e a **mesma lista de variáveis de ambiente**.
- Os **mesmos serviços** (Postgres, Mongo, Redis) com configurações parecidas.
- As portas ficam expostas para você acessar e debugar (API, frontend, nginx, bancos).

Assim, o que você testa localmente é o mesmo binário e a mesma configuração que vão para produção.

---

## 2. O que foi criado ou alterado

### 2.1 `docker-compose.staging.yml`

**O que é:** Um `docker-compose` que sobe o projeto com **build e configuração de produção**, mas com portas abertas para uso local.

**Por que fica igual à produção:**

| Item | Produção (ex.: Fly.io) | Staging (local) | Por que está igual |
|------|------------------------|-----------------|---------------------|
| **Backend** | Build com `backend/Dockerfile`, multi-stage, `npm run start:prod` | Mesmo `Dockerfile`, mesmo comando | Mesma imagem e mesmo processo em produção e local. |
| **Frontend** | Build com `frontend/Dockerfile` (node build + nginx servindo estático) | Mesmo `Dockerfile`, mesmo estágio nginx | Mesmo bundle e mesma forma de servir (arquivos estáticos em nginx). |
| **NODE_ENV** | `production` no Fly | `NODE_ENV: production` no compose | Logs, cache e comportamento de segurança idênticos. |
| **Postgres** | Postgres 16 (ex.: Fly Postgres) | `postgres:16-alpine`, mesmo usuário/senha/db via env | Mesma versão e mesmo esquema de credenciais. |
| **MongoDB** | Mongo (ex.: Atlas ou outro) | `mongo:7.0`, mesmo auth e database | Mesmo tipo de uso (chat, etc.). |
| **Redis** | Redis (ex.: Upstash ou Fly) | `redis:7-alpine`, mesma URL `redis://...` | Backend usa `REDIS_URL` nos dois ambientes. |
| **Variáveis** | `DATABASE_URL`, `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `CORS_ORIGIN` | Mesmas variáveis, montadas a partir do `.env` | Mesma “interface” que o backend espera em produção. |

**Diferença só de acesso:** No staging as portas (5432, 27017, 6379, 3000, 80, 8080) ficam expostas para você conectar e debugar; em produção isso não é necessário.

---

### 2.2 `nginx/nginx.staging.conf`

**O que é:** Configuração do nginx para o ambiente de staging.

**Por que existe:** No **dev** o nginx manda tráfego para o frontend na porta **5173** (Vite em modo dev). No **staging** o frontend já é o **build de produção** e sobe na porta **80** dentro do container. Esse arquivo faz o nginx do staging usar `frontend:80` em vez de `frontend:5173`.

**Por que fica igual:** Em produção o frontend é “um nginx servindo arquivos estáticos”. No staging você também tem nginx na frente desse mesmo build, então o fluxo (browser → nginx → frontend estático e nginx → backend para `/api` e `/socket.io`) replica o modelo de produção.

---

### 2.3 `.env.staging.example`

**O que é:** Exemplo de `.env` com **todas** as variáveis que o backend e o compose usam em ambiente “produção-like”.

**Por que fica igual:** Em produção (ex.: Fly.io) você define as mesmas chaves (`DATABASE_URL`, `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `CORS_ORIGIN`, etc.). No staging você usa as **mesmas chaves**, com valores locais (ex.: `redis://redis:6379`, Postgres no container). Assim o código do backend não vê diferença de “nome de variável”; só de valor (local vs. produção).

**Uso:** Copiar para `.env` na raiz e ajustar (principalmente `PROJECT_PATH` no Windows). Esse `.env` é lido pelo `docker-compose.staging.yml`.

---

### 2.4 `frontend/Dockerfile` – build args `VITE_API_URL` e `VITE_WS_URL`

**O que foi feito:** Foram adicionados `ARG VITE_API_URL` e `ARG VITE_WS_URL` no Dockerfile e repassados como `ENV` antes do `npm run build`.

**Por que fica igual:** Em produção o frontend é buildado com as URLs corretas da API e do WebSocket (ex.: `https://seu-backend.fly.dev`). No Vite, `VITE_*` são “embutidos” no build. No staging, o `docker-compose.staging.yml` passa esses args no build (a partir do `.env`), então o build local também fica com as URLs certas (ex.: `http://localhost:3000`) e o comportamento (chamar a API e o WS) é o mesmo que em produção, só que apontando para o backend local.

---

### 2.5 `docker-compose.staging.yml` – build do frontend com args

**O que foi feito:** O serviço `frontend` no staging passou a receber `VITE_API_URL` e `VITE_WS_URL` como build args (vindos do `.env`).

**Por que fica igual:** Garante que o build do frontend no Docker use as mesmas variáveis que você usaria em produção (ou em CI), só que com valores de localhost. O resultado é o mesmo “tipo” de build (estático + URLs configuráveis).

---

### 2.6 `docker-compose.prod.yml` – uso de `REDIS_URL`

**O que foi feito:** O backend em `docker-compose.prod.yml` passou a usar `REDIS_URL` em vez de `REDIS_HOST` + `REDIS_PORT`.

**Por que:** O código do backend (ex.: `redis.module.ts` e uso do Redis) espera **uma única URL** em `REDIS_URL`. Em produção (Fly, etc.) você já usa `REDIS_URL`. Deixar o prod compose com a mesma variável evita diferença de comportamento entre “prod compose” e “produção real”.

---

### 2.7 `AMBIENTE-LOCAL-PRODUCAO.md`

**O que é:** Guia rápido de uso: como criar o `.env`, subir o staging, acessar a aplicação, parar e usar o Adminer.

**Por que existe:** Para você não precisar decorar comandos e saber exatamente como subir o ambiente “local = produção”.

---

### 2.8 `.env.example` (raiz)

**O que foi feito:** Foi adicionado um comentário indicando o uso do `.env.staging.example` e do `docker-compose.staging.yml`, e referência ao guia de ambiente local.

**Por que:** Quem abrir o `.env.example` na raiz já vê que existe um fluxo para deixar o local igual à produção e onde achar os arquivos.

---

## 3. Variáveis de ambiente – resumo (local = produção)

As **mesmas chaves** que você usa em produção (ex.: no Fly.io) são usadas no staging, com valores locais:

| Variável | Uso em produção | Uso no staging |
|----------|------------------|-----------------|
| `NODE_ENV` | `production` | `production` (definido no compose) |
| `DATABASE_URL` | URL do Postgres (Fly, etc.) | Montada no compose a partir de `POSTGRES_*` |
| `MONGODB_URI` | URL do Mongo (Atlas, etc.) | Montada no compose a partir de `MONGO_*` |
| `REDIS_URL` | URL do Redis (Upstash, etc.) | `redis://redis:6379` |
| `JWT_SECRET` | Secret do JWT | Valor do `.env` (pode ser um de teste) |
| `CORS_ORIGIN` | Domínio(s) do frontend | `http://localhost`, etc. |
| `VITE_API_URL` / `VITE_WS_URL` | URLs do backend no build do frontend | `http://localhost:3000` (ou o que estiver no `.env`) |

Assim, a **lista de variáveis** é a mesma; só mudam os **valores** (local vs. produção).

---

## 4. Por que “está igual”

- **Mesmo build do backend:** mesmo `Dockerfile`, mesmo `start:prod`, mesma versão de Node e de dependências.
- **Mesmo build do frontend:** mesmo `Dockerfile`, mesmo `npm run build`, mesmas `VITE_*` injetadas no build.
- **Mesmo runtime:** `NODE_ENV=production`, mesmas variáveis de ambiente que o backend lê em produção.
- **Mesmos serviços:** Postgres, Mongo e Redis com as mesmas variáveis de conexão que o backend usa em produção.
- **Mesmo fluxo HTTP:** nginx na frente do frontend estático e do backend (`/api`, `/socket.io`), como em um deploy com reverse proxy.

A única diferença é o **onde** (sua máquina vs. Fly/Vercel) e as **portas expostas** no staging para debug. O comportamento da aplicação é o mesmo.

---

## 5. Como usar (resumo)

1. **Opção fácil:** na raiz, execute `.\setup-staging.ps1` (cria o `.env` se não existir e sobe o ambiente).
2. **Opção manual:** `copy .env.staging.example .env`, ajuste `PROJECT_PATH` (e senhas, se quiser) e depois `docker compose -f docker-compose.staging.yml up --build`.
3. Acessar: **http://localhost** (recomendado) ou http://localhost:3000 (API) e http://localhost:8080 (frontend direto).
4. Parar: `docker compose -f docker-compose.staging.yml down`.

Detalhes e comandos extras estão em **AMBIENTE-LOCAL-PRODUCAO.md**.
