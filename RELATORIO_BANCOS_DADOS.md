# 📊 Relatório: Uso dos Bancos de Dados no Projeto Yu-Gi-Oh!

## 📋 Resumo Executivo

Este projeto utiliza **3 bancos de dados diferentes**, cada um otimizado para um propósito específico:

1. **PostgreSQL** - Banco de dados relacional principal (dados estruturados)
2. **MongoDB** - Banco NoSQL para chat e mensagens (dados não estruturados)
3. **Redis** - Cache em memória para performance e sessões (dados temporários)

---

## 🗄️ 1. PostgreSQL - Banco de Dados Principal

### **Propósito:**
Armazenar todos os dados estruturados e relacionais do jogo, garantindo integridade referencial e consistência transacional.

### **Tecnologia:**
- **Tipo:** Relacional (SQL)
- **ORM:** TypeORM
- **Versão:** PostgreSQL 16
- **Pool de Conexões:** 20-100 conexões simultâneas

### **Tabelas e Entidades Armazenadas:**

#### 👤 **Sistema de Usuários**
- **`users`** - Dados dos jogadores
  - Informações de perfil (nickname, username, email, senha)
  - Estatísticas (wins, losses, rating, level, experience)
  - Sistema econômico (credits, cash)
  - Status (isOnline, isBanned, isEmailVerified)
  - Classe do jogador (Novato, Aprendiz, Veterano, Mestre, Lendário)
  - Biografia e avatar

#### 🃏 **Sistema de Cartas**
- **`cards`** - Catálogo de cartas do jogo
  - Informações da carta (nome, descrição, imagem)
  - Tipo (Monster, Spell, Trap)
  - Atributos (ATK, DEF, Level, Rarity)
  - Preços (priceCredits, priceCash)
  - Status (isActive, isBanned, maxCopiesInDeck)

- **`user_cards`** - Inventário de cartas dos jogadores
  - Relação usuário-carta
  - Quantidade de cada carta possuída

#### 📚 **Sistema de Decks**
- **`decks`** - Decks criados pelos jogadores
  - Nome, descrição, tipo
  - Relação com usuário
  - Status (isActive, isPublic)

- **`deck_cards`** - Cartas dentro de cada deck
  - Relação deck-carta
  - Quantidade de cada carta no deck

#### ⚔️ **Sistema de Duelos**
- **`duels`** - Duelos ativos e finalizados
  - Jogadores (player1_id, player2_id)
  - Status (WAITING, IN_PROGRESS, FINISHED, CANCELLED)
  - Estado do jogo (lifePoints, currentTurn, currentPhase)
  - Campos do jogo (player1Field, player2Field - JSONB)
  - Resultado e vencedor

- **`duel_logs`** - Histórico de ações dos duelos
  - Logs de cada ação realizada
  - Timestamps e detalhes

#### 🏆 **Sistema de Temporadas e Rankings**
- **`seasons`** - Temporadas do jogo
  - Período (startDate, endDate)
  - Status (ACTIVE, FINISHED)

- **`season_rankings`** - Rankings por temporada
  - Pontuação do jogador na temporada
  - Posição no ranking

#### 👥 **Sistema de Grupos (Clãs)**
- **`groups`** - Grupos/clãs criados
  - Nome, descrição, tag
  - Configurações do grupo

- **`group_members`** - Membros dos grupos
  - Relação grupo-usuário
  - Role (LEADER, ADMIN, MEMBER)
  - Estatísticas do membro (weeklyScore, seasonScore, totalScore)

- **`group_messages`** - Mensagens nos grupos
  - Mensagens de chat dos grupos
  - Relação com grupo e usuário

#### 💰 **Sistema Econômico**
- **`transactions`** - Histórico de transações
  - Tipo de moeda (credits, cash)
  - Tipo de transação (PURCHASE, REWARD, REFUND, etc.)
  - Valor e descrição
  - Metadados (JSONB)

#### 🛒 **Sistema de Loja**
- **`shop_items`** - Itens disponíveis na loja
  - Cartas, pacotes, itens especiais
  - Preços e disponibilidade

#### 🏅 **Sistema de Conquistas**
- **`achievements`** - Conquistas desbloqueadas
  - Relação usuário-conquista
  - Data de desbloqueio

#### 🎯 **Sistema de Torneios**
- **`tournaments`** - Torneios criados
  - Configurações, datas, prêmios

- **`tournament_participants`** - Participantes dos torneios
  - Relação torneio-usuário

- **`tournament_matches`** - Partidas dos torneios
  - Duelos dentro dos torneios

#### 📰 **Sistema de Notícias**
- **`news`** - Notícias e anúncios
  - Título, conteúdo, imagem
  - Status (draft, published)

#### 💬 **Sistema de Amizades**
- **`friendships`** - Relações de amizade
  - Status (PENDING, ACCEPTED, BLOCKED)

- **`private_messages`** - Mensagens privadas entre usuários
  - Mensagens diretas
  - Status de leitura

#### 🎮 **Sistema de Arena**
- **`challenge_arenas`** - Arenas de desafio
  - Configurações de arenas especiais

### **Características Técnicas:**
- ✅ **ACID Compliance** - Garante integridade dos dados
- ✅ **Transações** - Operações atômicas
- ✅ **Relacionamentos** - Foreign keys e constraints
- ✅ **Índices** - Otimização de queries
- ✅ **JSONB** - Armazenamento de dados semi-estruturados (campos de jogo)
- ✅ **Pool de Conexões** - 20-100 conexões simultâneas
- ✅ **Backup Automático** - Via volumes Docker

### **Uso no Código:**
```typescript
// Exemplo: TypeORM Entity
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;
  
  @Column({ unique: true })
  email: string;
  // ...
}
```

---

## 🍃 2. MongoDB - Banco de Chat e Mensagens

### **Propósito:**
Armazenar mensagens de chat em tempo real de forma escalável e flexível, sem necessidade de schema rígido.

### **Tecnologia:**
- **Tipo:** NoSQL (Document-based)
- **ODM:** Mongoose
- **Versão:** MongoDB 7.0
- **Database:** `yugioh_chat`

### **Coleções Armazenadas:**

#### 💬 **Mensagens de Chat**
- **`messages`** - Mensagens do chat global
  - `userId` - ID do usuário que enviou
  - `username` - Nome do usuário
  - `content` - Conteúdo da mensagem
  - `channel` - Canal do chat (global, grupo, etc.)
  - `recipientId` - Para mensagens privadas (opcional)
  - `createdAt` - Timestamp automático

### **Características:**
- ✅ **Schema Flexível** - Fácil adicionar novos campos
- ✅ **Escalabilidade** - Ideal para grandes volumes de mensagens
- ✅ **Performance** - Otimizado para leitura/escrita rápida
- ✅ **TTL Index** - Limpeza automática de mensagens antigas (opcional)
- ✅ **Tolerância a Falhas** - Se MongoDB falhar, chat é desabilitado mas jogo continua

### **Uso no Código:**
```typescript
// Exemplo: Mongoose Schema
@Schema({ timestamps: true })
export class Message {
  @Prop({ required: true })
  userId: string;
  
  @Prop({ required: true })
  content: string;
  // ...
}
```

### **Funcionalidades:**
- Chat global em tempo real
- Mensagens privadas entre usuários
- Histórico de mensagens (últimas 50 por padrão)
- Limpeza automática de mensagens antigas

---

## ⚡ 3. Redis - Cache e Sessões

### **Propósito:**
Armazenar dados temporários em memória para máxima performance, incluindo cache, sessões e filas de matchmaking.

### **Tecnologia:**
- **Tipo:** In-Memory Key-Value Store
- **Cliente:** redis (node-redis)
- **Versão:** Redis 7
- **Memória Máxima:** 512 MB
- **Política de Eviction:** allkeys-lru (remove menos usados quando memória cheia)

### **Dados Armazenados:**

#### 🔐 **Sessões de Usuário**
- **Chave:** `user:{userId}:session`
- **Valor:** Dados da sessão do usuário
- **TTL:** Configurável (expira automaticamente)
- **Uso:** Gerenciar sessões ativas, logout forçado

#### 📍 **Histórico de IPs**
- **Chave:** `user:{userId}:ip_history`
- **Tipo:** Lista (List)
- **Uso:** Rastrear IPs usados pelo usuário (segurança/admin)
- **Limite:** Últimos 10-50 IPs

#### 🎮 **Matchmaking (Fila de Duelos)**
- **Armazenamento:** Em memória do Node.js (não no Redis atualmente)
- **Futuro:** Pode ser migrado para Redis para escalabilidade
- **Uso:** Fila de jogadores procurando duelo

#### 🏟️ **Arena Matchmaking**
- **Armazenamento:** Em memória do Node.js
- **Divisões:** Por nível do jogador
- **Uso:** Fila de jogadores procurando arena

#### 💾 **Cache Geral**
- **Chaves:** Dados frequentemente acessados
- **Uso:** Reduzir carga no PostgreSQL
- **TTL:** Configurável por tipo de dado

### **Características:**
- ✅ **Ultra Rápido** - Acesso em nanossegundos
- ✅ **TTL Automático** - Expiração automática de dados
- ✅ **Estruturas de Dados** - Strings, Lists, Sets, Hashes
- ✅ **Persistência** - AOF (Append Only File) habilitado
- ✅ **Tolerância a Falhas** - Se Redis falhar, sistema continua (sem cache)

### **Uso no Código:**
```typescript
// Exemplo: Redis Service
async set(key: string, value: string, ttl?: number) {
  if (ttl) {
    await this.redisClient.setEx(key, ttl, value);
  } else {
    await this.redisClient.set(key, value);
  }
}
```

### **Funcionalidades:**
- Cache de dados frequentes
- Gerenciamento de sessões
- Histórico de IPs para segurança
- Suporte para matchmaking (futuro)
- Limpeza automática de dados expirados

---

## 📊 Comparação dos Bancos

| Característica | PostgreSQL | MongoDB | Redis |
|----------------|------------|---------|-------|
| **Tipo** | Relacional (SQL) | NoSQL (Document) | In-Memory (Key-Value) |
| **Uso Principal** | Dados estruturados | Chat/Mensagens | Cache/Sessões |
| **Persistência** | ✅ Disco | ✅ Disco | ⚠️ Memória (AOF opcional) |
| **Velocidade** | Rápido | Muito Rápido | Ultra Rápido |
| **Transações** | ✅ ACID | ⚠️ Limitado | ❌ Não |
| **Escalabilidade** | Vertical | Horizontal | Horizontal |
| **Schema** | Rígido | Flexível | Sem Schema |
| **Queries Complexas** | ✅ Excelente | ⚠️ Limitado | ❌ Não |
| **Relacionamentos** | ✅ Foreign Keys | ⚠️ Manual | ❌ Não |

---

## 🔄 Fluxo de Dados

### **Cenário 1: Login do Usuário**
1. **PostgreSQL** → Valida credenciais na tabela `users`
2. **Redis** → Cria sessão `user:{id}:session`
3. **MongoDB** → (Não usado neste fluxo)

### **Cenário 2: Enviar Mensagem no Chat**
1. **MongoDB** → Salva mensagem na coleção `messages`
2. **WebSocket** → Broadcast para outros usuários
3. **Redis** → (Opcional) Cache de últimas mensagens

### **Cenário 3: Criar Duelo**
1. **PostgreSQL** → Cria registro na tabela `duels`
2. **PostgreSQL** → Cria logs na tabela `duel_logs`
3. **Redis** → (Futuro) Cache de duelos ativos

### **Cenário 4: Comprar Carta**
1. **PostgreSQL** → Verifica saldo na tabela `users`
2. **PostgreSQL** → Cria transação na tabela `transactions`
3. **PostgreSQL** → Adiciona carta em `user_cards`
4. **Redis** → Invalida cache do inventário

---

## 🎯 Por Que 3 Bancos Diferentes?

### **PostgreSQL (Dados Estruturados)**
- ✅ Dados críticos precisam de integridade (usuários, cartas, duelos)
- ✅ Relacionamentos complexos (usuário → decks → cartas)
- ✅ Transações ACID (compras, transferências)
- ✅ Queries complexas (rankings, estatísticas)

### **MongoDB (Chat)**
- ✅ Dados não estruturados (mensagens variam muito)
- ✅ Alta velocidade de escrita (muitas mensagens por segundo)
- ✅ Escalabilidade horizontal (pode crescer facilmente)
- ✅ Schema flexível (fácil adicionar novos campos)

### **Redis (Cache)**
- ✅ Dados temporários (sessões, cache)
- ✅ Ultra performance (nanossegundos)
- ✅ TTL automático (expiração de dados)
- ✅ Estruturas de dados avançadas (listas, sets)

---

## 📈 Estatísticas de Uso Estimadas

### **PostgreSQL:**
- **Tabelas:** ~20 tabelas
- **Tamanho Estimado:** 100 MB - 10 GB (depende de usuários)
- **Queries/Segundo:** 50-500 (média)
- **Conexões Simultâneas:** 20-100

### **MongoDB:**
- **Coleções:** 1 principal (messages)
- **Tamanho Estimado:** 50 MB - 5 GB (mensagens)
- **Escritas/Segundo:** 10-100 (chat ativo)
- **Leituras/Segundo:** 50-500 (carregar histórico)

### **Redis:**
- **Chaves Ativas:** 100-10.000 (depende de usuários online)
- **Memória Usada:** 10 MB - 512 MB
- **Operações/Segundo:** 1.000-10.000
- **TTL Médio:** 1 hora - 24 horas

---

## 🛠️ Manutenção e Backup

### **PostgreSQL:**
- ✅ Backup diário recomendado
- ✅ Vacuum periódico (otimização)
- ✅ Monitoramento de índices
- ✅ Logs de queries lentas

### **MongoDB:**
- ✅ Backup diário recomendado
- ✅ Limpeza de mensagens antigas (TTL)
- ✅ Monitoramento de índices
- ✅ Replicação (produção)

### **Redis:**
- ✅ AOF habilitado (persistência)
- ✅ Monitoramento de memória
- ✅ Limpeza automática (LRU)
- ✅ Backup opcional (dados temporários)

---

## ✅ Conclusão

Cada banco de dados foi escolhido para otimizar uma função específica:

- **PostgreSQL** = Dados críticos e relacionais (o coração do sistema)
- **MongoDB** = Chat escalável (comunicação em tempo real)
- **Redis** = Performance máxima (cache e sessões)

Esta arquitetura híbrida garante:
- ✅ **Performance** - Cada banco otimizado para seu uso
- ✅ **Escalabilidade** - Pode crescer independentemente
- ✅ **Confiabilidade** - Falha de um não derruba o sistema
- ✅ **Custo-Efetividade** - Usa o banco certo para cada tarefa

---

**Última Atualização:** Janeiro 2025  
**Versão do Documento:** 1.0












