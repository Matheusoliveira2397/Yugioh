# Testar localmente com as mesmas características de produção

Este guia mostra como subir o projeto **localmente** com build e configuração **iguais à produção**, para testar comportamento real antes do deploy.

## O que você obtém

- **Build de produção**: backend e frontend usam os mesmos Dockerfiles que em produção (Fly.io / Vercel).
- **NODE_ENV=production**: mesmo comportamento de logs, cache e segurança.
- **Mesmas variáveis de ambiente**: mesma lista de env vars que produção.
- **Portas expostas**: Postgres (5432), Mongo (27017), Redis (6379), API (3000), frontend (8080) e nginx (80) para debug.

## Passo a passo

### 1. Arquivo de ambiente

Na **raiz do projeto** (pasta `Yugioh`):

**Opção A – Script (recomendado):**  
O script cria o `.env` se não existir e sobe o ambiente:

```powershell
.\setup-staging.ps1
```

**Opção B – Manual:**

```powershell
# Copiar o exemplo de staging
copy .env.staging.example .env

# Editar .env e ajustar PROJECT_PATH se precisar (ex.: D:/Yugioh)
```

No `.env` deixe pelo menos:

- `PROJECT_PATH=D:/Yugioh` (ou o caminho da sua pasta, no Windows use `/` ou `\\`)
- Senhas dos bancos (podem ser as de exemplo para testes locais)

### 2. Subir o ambiente “produção local”

```powershell
docker compose -f docker-compose.staging.yml up --build
```

Na primeira vez o build pode demorar alguns minutos. Depois:

- **Aplicação (recomendado)**: **http://localhost** (nginx faz proxy para frontend + API)
- **API direta**: http://localhost:3000
- **Frontend direto**: http://localhost:8080

### 3. Parar

```powershell
docker compose -f docker-compose.staging.yml down
```

Para remover também os volumes (dados dos bancos):

```powershell
docker compose -f docker-compose.staging.yml down -v
```

## Opcional: Adminer (interface do banco)

Para acessar o Postgres com interface web:

```powershell
docker compose -f docker-compose.staging.yml --profile tools up -d
```

Adminer fica em **http://localhost:8081** (servidor: `postgres`, usuário/senha do `.env`).

## Diferenças em relação ao `docker-compose.yml` (dev)

| Aspecto        | Dev (`docker-compose.yml`)     | Staging (`docker-compose.staging.yml`) |
|----------------|--------------------------------|----------------------------------------|
| Backend        | `nest start --watch`          | Build de produção, `start:prod`        |
| Frontend       | Vite dev (hot reload)          | Build estático servido por nginx       |
| NODE_ENV       | development                    | production                             |
| Volumes        | Código montado (edição ao vivo)| Só dados (uploads, DBs)                |
| Uso            | Desenvolvimento do dia a dia   | Testar exatamente como em produção    |

## Variáveis que batem com produção

O backend em produção (por exemplo no Fly.io) usa as mesmas variáveis. No staging você usa as mesmas **chaves**, com valores locais:

- `DATABASE_URL` (definido no compose a partir de `POSTGRES_*`)
- `MONGODB_URI` (a partir de `MONGO_*`)
- `REDIS_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`

Assim você pode copiar a lista de variáveis do Fly (ou do `.env` de produção) e só trocar os valores para os do seu `.env` local quando for testar em staging.

## Resumo de comandos

```powershell
# Subir ambiente “produção local”
docker compose -f docker-compose.staging.yml up --build

# Subir em background
docker compose -f docker-compose.staging.yml up -d --build

# Ver logs
docker compose -f docker-compose.staging.yml logs -f

# Parar
docker compose -f docker-compose.staging.yml down
```

Com isso você tem o ambiente com as mesmas características de produção aí no local e pode testar tudo da melhor forma.
