# Script de stress test (dados simulados)

Um único script SQL enche o banco com dados simulados para testar limites. Depois pode apagar **só** esses dados.

## O que o script insere

- **100 usuários** (todos com imagem de perfil: `/avatars/seed_1.png`, etc.)
- **1000 cartas** (idCarta `SEED-1` … `SEED-1000`)
- **500 cartas na maleta** por usuário (`user_cards`)
- **3 decks** por usuário, com 40 cartas cada
- **5 clãs** (“Clã Seed 1” … “Clã Seed 5”), todos os usuários em algum clã
- **Amizades** entre usuários (cada um com vários amigos)
- **10 temporadas** (“Temporada Seed 1” …) e **rankings** por usuário
- **2000 duelos** entre usuários seed
- **5000 registos** em `duel_history`
- **50 transações** por usuário (histórico de pagamento)
- **10 torneios** (“Torneio Seed 1” …) finalizados, com participantes e partidas

## Como rodar

### Opção 1: Terminal (psql)

Na pasta do projeto (ou na pasta `backend`):

```bash
# Com URL do banco
psql "postgresql://user:senha@host:5432/nome_do_banco" -f backend/scripts/seed-stress.sql

# Ou, se tiver DATABASE_URL no .env (Linux/Mac)
cd backend && psql "$DATABASE_URL" -f scripts/seed-stress.sql
```

No Windows (PowerShell), para usar a variável de ambiente:

```powershell
cd backend
$env:PGPASSWORD = "sua_senha"
psql -h localhost -U seu_user -d nome_do_banco -f scripts/seed-stress.sql
```

Ou use a connection string num único argumento entre aspas.

### Opção 2: Colar no editor SQL (pgAdmin, DBeaver, etc.)

1. Abra o ficheiro `backend/scripts/seed-stress.sql`.
2. Copie **todo** o conteúdo (Ctrl+A, Ctrl+C).
3. Cole no editor SQL do seu cliente e execute.

A execução pode demorar alguns minutos (muitos INSERTs).

## Alterar a quantidade de usuários

No ficheiro `seed-stress.sql`, procure por `generate_series(1, 100)` e troque **100** pelo número desejado (ex.: 500). Troque também o `generate_series(1, 5)` dos grupos para algo como `(N_USERS / 20)::int` se quiser mais clãs.

## Apagar só os dados simulados

### Opção A: Ficheiro só de limpeza

```bash
psql "$DATABASE_URL" -f backend/scripts/seed-stress-clear-only.sql
```

Ou abra `seed-stress-clear-only.sql`, copie todo o conteúdo e execute no editor SQL.

### Opção B: Usar o final do `seed-stress.sql`

No final de `seed-stress.sql` está a secção **PARTE 2 - LIMPEZA** em comentário (`/* ... */`). Para usar:

1. Abra `seed-stress.sql`.
2. Copie apenas as linhas dos `DELETE` (a partir de `DELETE FROM tournament_matches` até `DELETE FROM cards ...`).
3. Cole no editor SQL e execute (sem o `/*` e `*/`).

A ordem dos DELETEs respeita as chaves estrangeiras.

## Requisitos

- PostgreSQL com extensão **pgcrypto** (para hash da senha dos usuários seed). O script faz `CREATE EXTENSION IF NOT EXISTS pgcrypto;`.
- Senha dos usuários seed: **Senha123!** (todos iguais para teste).
