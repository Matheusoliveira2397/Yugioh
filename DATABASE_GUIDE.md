# 📊 Guia dos Bancos de Dados - Yu-Gi-Oh! Game

## 🗄️ Arquitetura de Dados

O sistema utiliza **3 bancos de dados** diferentes:

### 1. PostgreSQL (Banco Principal) 🐘
**Container:** `yugioh-postgres`
**Porta:** 5432
**Banco:** `yugioh_db`

#### 📋 Tabelas e Funções:

##### 👤 **users** - Usuários do Sistema
```sql
-- Ver todos os usuários
SELECT id, username, nickname, email, role, coins, wins, losses FROM users;

-- Contar usuários
SELECT COUNT(*) FROM users;

-- Promover usuário para MASTER
UPDATE users SET role = 'MASTER' WHERE username = 'seu_usuario';
```
**Colunas importantes:**
- `role`: PLAYER, ADMIN, MASTER
- `coins`, `credits`, `cash`, `gems`: Moedas do jogo
- `wins`, `losses`, `rating`: Estatísticas de duelos
- `emailVerified`: Status de verificação

---

##### 🎴 **cards** - Cartas do Jogo
```sql
-- Ver todas as cartas
SELECT id, name, type, rarity, atk, def FROM cards LIMIT 10;

-- Contar cartas por tipo
SELECT type, COUNT(*) FROM cards GROUP BY type;

-- Cartas mais raras
SELECT name, rarity FROM cards WHERE rarity = 'Secret Rare';
```
**Tipos:** Monster, Spell, Trap
**Raridades:** Common, Rare, Super Rare, Ultra Rare, Secret Rare, Legendary

---

##### 🃏 **decks** - Decks dos Jogadores
```sql
-- Ver decks de um usuário
SELECT d.id, d.name, u.username 
FROM decks d 
JOIN users u ON d."userId" = u.id;

-- Contar cartas em um deck
SELECT COUNT(*) FROM deck_cards WHERE "deckId" = 'deck-id-aqui';
```

---

##### ⚔️ **duels** - Duelos/Partidas
```sql
-- Ver duelos ativos
SELECT id, status, "player1LifePoints", "player2LifePoints" 
FROM duels WHERE status = 'IN_PROGRESS';

-- Histórico de duelos
SELECT * FROM duels WHERE status = 'FINISHED' ORDER BY "finishedAt" DESC LIMIT 10;
```
**Status:** WAITING, IN_PROGRESS, FINISHED, CANCELLED

---

##### 🏆 **tournaments** - Torneios
```sql
-- Ver torneios ativos
SELECT name, status, "maxParticipants", "currentParticipants" 
FROM tournaments WHERE status != 'finished';

-- Participantes de um torneio
SELECT tp.*, u.username 
FROM tournament_participants tp
JOIN users u ON tp."userId" = u.id
WHERE tp."tournamentId" = 'torneio-id-aqui';
```

---

##### 🎖️ **seasons** - Temporadas Competitivas
```sql
-- Temporada ativa
SELECT * FROM seasons WHERE "isActive" = true;

-- Ranking da temporada
SELECT sr.*, u.username 
FROM season_rankings sr
JOIN users u ON sr."userId" = u.id
ORDER BY sr."seasonScore" DESC LIMIT 20;
```

---

##### 👥 **groups** - Grupos/Clãs
```sql
-- Ver todos os grupos
SELECT name, tag, "totalScore", "maxMembers" FROM groups;

-- Membros de um grupo
SELECT gm.role, u.username, gm."totalScore"
FROM group_members gm
JOIN users u ON gm."userId" = u.id
WHERE gm."groupId" = 'group-id-aqui';
```

---

##### 🛒 **shop_items** - Loja
```sql
-- Itens disponíveis na loja
SELECT si.*, c.name as card_name
FROM shop_items si
LEFT JOIN cards c ON si.card_id = c.id
WHERE si."isAvailable" = true;
```

---

##### 💰 **transactions** - Transações Econômicas
```sql
-- Transações recentes
SELECT t.*, u.username
FROM transactions t
JOIN users u ON t."userId" = u.id
ORDER BY t."createdAt" DESC LIMIT 20;

-- Total ganho/gasto por usuário
SELECT "userId", "currencyType", SUM(amount) as total
FROM transactions
GROUP BY "userId", "currencyType";
```

---

##### 👫 **friendships** - Amizades
```sql
-- Amigos de um usuário
SELECT f.*, u1.username as user, u2.username as friend
FROM friendships f
JOIN users u1 ON f.user_id = u1.id
JOIN users u2 ON f.friend_id = u2.id
WHERE f.status = 'accepted';
```

---

### 2. MongoDB (Chat e Logs) 🍃
**Container:** `yugioh-mongodb`
**Porta:** 27017
**Banco:** `yugioh_chat`

#### 📋 Collections:

##### 💬 **messages** - Mensagens de Chat
```javascript
// Conectar no MongoDB
docker exec -it yugioh-mongodb mongosh --username yugioh_mongo --password yugioh_mongo_password --authenticationDatabase admin

// Usar o banco
use yugioh_chat

// Ver mensagens recentes
db.messages.find().sort({createdAt: -1}).limit(10)

// Mensagens de um canal
db.messages.find({channel: "global"})

// Mensagens privadas
db.messages.find({recipientId: {$exists: true}})

// Contar mensagens
db.messages.countDocuments()

// Limpar mensagens antigas (mais de 30 dias)
db.messages.deleteMany({
  createdAt: {$lt: new Date(Date.now() - 30*24*60*60*1000)}
})
```

**Estrutura:**
```javascript
{
  userId: "uuid",
  username: "player123",
  content: "Boa partida!",
  channel: "global",
  recipientId: "uuid", // opcional, para mensagens privadas
  createdAt: ISODate("2025-11-04T...")
}
```

---

### 3. Redis (Cache e Sessões) 🔴
**Container:** `yugioh-redis`
**Porta:** 6379

#### 🔑 Dados em Cache:

```bash
# Conectar no Redis
docker exec -it yugioh-redis redis-cli

# Ver todas as chaves
KEYS *

# Ver valor de uma chave
GET chave_aqui

# Ver tipo de uma chave
TYPE chave_aqui

# TTL (tempo de vida) de uma chave
TTL chave_aqui

# Limpar todo o cache
FLUSHALL

# Ver estatísticas
INFO stats
```

**Usado para:**
- 🔐 Sessões de usuários
- ⚡ Cache de queries frequentes
- 🎮 Estado de partidas em tempo real
- 📊 Filas de matchmaking

---

## 🛠️ Comandos Úteis

### Backup PostgreSQL
```bash
docker exec yugioh-postgres pg_dump -U yugioh_user yugioh_db > backup.sql
```

### Restaurar PostgreSQL
```bash
docker exec -i yugioh-postgres psql -U yugioh_user yugioh_db < backup.sql
```

### Backup MongoDB
```bash
docker exec yugioh-mongodb mongodump --username yugioh_mongo --password yugioh_mongo_password --authenticationDatabase admin --db yugioh_chat --out /backup
```

### Ver logs dos bancos
```bash
# PostgreSQL
docker logs yugioh-postgres --tail 50

# MongoDB
docker logs yugioh-mongodb --tail 50

# Redis
docker logs yugioh-redis --tail 50
```

---

## 📊 Queries de Análise

### Top 10 Jogadores
```sql
SELECT username, wins, losses, rating, coins
FROM users
ORDER BY rating DESC
LIMIT 10;
```

### Cartas mais usadas
```sql
SELECT c.name, COUNT(*) as usage_count
FROM deck_cards dc
JOIN cards c ON dc."cardId" = c.id
GROUP BY c.name
ORDER BY usage_count DESC
LIMIT 10;
```

### Economia do Jogo
```sql
SELECT 
  SUM(coins) as total_coins,
  SUM(credits) as total_credits,
  SUM(cash) as total_cash,
  AVG(coins) as avg_coins_per_user
FROM users;
```

### Atividade de Duelos
```sql
SELECT 
  DATE(duels."createdAt") as date,
  COUNT(*) as duels_count
FROM duels
WHERE duels."createdAt" > NOW() - INTERVAL '7 days'
GROUP BY DATE(duels."createdAt")
ORDER BY date DESC;
```

---

## 🔍 Ferramentas Recomendadas

### Para visualizar os bancos graficamente:

1. **PostgreSQL:**
   - DBeaver (gratuito)
   - pgAdmin 4
   - TablePlus
   - Conectar: localhost:5432

2. **MongoDB:**
   - MongoDB Compass
   - Studio 3T
   - Conectar: mongodb://yugioh_mongo:yugioh_mongo_password@localhost:27017

3. **Redis:**
   - RedisInsight (gratuito)
   - Medis
   - Conectar: localhost:6379

---

## 🔐 Credenciais

### PostgreSQL
- Host: localhost
- Porta: 5432
- Database: yugioh_db
- Usuário: yugioh_user
- Senha: yugioh_password_2024

### MongoDB
- Host: localhost
- Porta: 27017
- Database: yugioh_chat
- Usuário: yugioh_mongo
- Senha: yugioh_mongo_password

### Redis
- Host: localhost
- Porta: 6379
- Senha: (nenhuma)

---

## 📈 Monitoramento

### Ver tamanho dos bancos
```bash
# PostgreSQL
docker exec yugioh-postgres psql -U yugioh_user -d yugioh_db -c "SELECT pg_size_pretty(pg_database_size('yugioh_db'));"

# MongoDB
docker exec yugioh-mongodb mongosh --username yugioh_mongo --password yugioh_mongo_password --authenticationDatabase admin --eval "db.stats()"
```

### Verificar conexões ativas
```bash
# PostgreSQL
docker exec yugioh-postgres psql -U yugioh_user -d yugioh_db -c "SELECT count(*) FROM pg_stat_activity;"

# Redis
docker exec yugioh-redis redis-cli INFO clients
```

---

## 🧹 Manutenção

### Limpar dados de teste
```sql
-- Remover usuários de teste
DELETE FROM users WHERE email LIKE '%@test.com';

-- Limpar duelos antigos
DELETE FROM duels WHERE status = 'FINISHED' AND "finishedAt" < NOW() - INTERVAL '90 days';

-- Limpar logs antigos
DELETE FROM duel_logs WHERE "createdAt" < NOW() - INTERVAL '30 days';
```

### MongoDB
```javascript
// Limpar mensagens antigas
db.messages.deleteMany({
  createdAt: {$lt: new Date(Date.now() - 60*24*60*60*1000)}
})
```

---

## ⚠️ Importante

- Sempre faça **backup** antes de modificar dados
- Use **transações** para operações críticas
- Monitore o **tamanho dos bancos** regularmente
- Configure **índices** para queries lentas
- Implemente **rotação de logs**
