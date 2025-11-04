# 🛒 SISTEMA COMPLETO DE COMPRA DE CARTAS - GUIA DEFINITIVO

## **📋 VISÃO GERAL DO SISTEMA**

### **Fluxo Completo:**
```
1. ADMIN cria carta com preços
   ↓
2. Carta é salva no banco (tabela: cards)
   ↓
3. Usuário vê carta na loja
   ↓
4. Usuário tenta comprar
   ↓
5. BACKEND verifica saldo (coins/credits/cash)
   ↓
6. Se OK: deduz saldo e adiciona ao inventário
   ↓
7. Carta fica disponível no inventário do usuário
```

---

## **💾 ESTRUTURA DO BANCO DE DADOS**

### **Tabela: `cards` (Cartas)**
```sql
CREATE TABLE cards (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,
  description TEXT,
  type VARCHAR,
  rarity VARCHAR,
  atk INTEGER,
  def INTEGER,
  level INTEGER,
  
  -- PREÇOS (SALVOS AQUI!)
  price_coins INTEGER,      -- Preço em moedas
  price_credits INTEGER,    -- Preço em créditos
  price_cash DECIMAL(10,2), -- Preço em dinheiro real
  is_for_sale BOOLEAN,      -- Se está na loja
  
  -- EFEITO (JSON)
  effect JSONB,             -- Efeito da carta
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### **Tabela: `users` (Usuários)**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR UNIQUE,
  email VARCHAR UNIQUE,
  
  -- SALDO (SALVO AQUI!)
  coins INTEGER DEFAULT 0,      -- Moedas (grátis)
  credits INTEGER DEFAULT 0,    -- Créditos (premium gratuito)
  cash INTEGER DEFAULT 0,       -- Cash (premium pago)
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### **Tabela: `user_cards` (Inventário)**
```sql
CREATE TABLE user_cards (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  card_id UUID REFERENCES cards(id),
  quantity INTEGER DEFAULT 1,    -- Quantas cópias
  acquired_by VARCHAR,           -- PURCHASE, REWARD, DROP, GIFT
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## **🎯 PARTE 1: CADASTRAR CARTA COM PREÇOS**

### **Endpoint:**
```
POST /api/cards
```

### **Request Body:**
```json
{
  "name": "Dark Magician",
  "description": "The ultimate wizard in terms of attack and defense.",
  "type": "Monster",
  "monsterType": "Effect",
  "attribute": "DARK",
  "race": "Spellcaster",
  "level": 7,
  "atk": 2500,
  "def": 2100,
  "rarity": "Ultra Rare",
  
  // ========== PREÇOS (SALVOS NO BANCO) ==========
  "priceCoins": 5000,      // ← Preço em moedas
  "priceCredits": 100,     // ← Preço em créditos
  "priceCash": 4.99,       // ← Preço em cash (R$)
  "isForSale": true        // ← Disponível na loja
}
```

### **O que acontece no Backend:**
```typescript
// cards.service.ts
async create(cardData: CreateCardDto) {
  // 1. Criar carta
  const card = this.cardsRepository.create(cardData);
  
  // 2. Salvar no banco (COM OS PREÇOS!)
  const savedCard = await this.cardsRepository.save(card);
  
  // 3. Carta está salva com:
  // - priceCoins: 5000
  // - priceCredits: 100
  // - priceCash: 4.99
  // - isForSale: true
  
  return savedCard;
}
```

### **Resultado no Banco:**
```sql
INSERT INTO cards (
  name, type, level, atk, def, rarity,
  price_coins, price_credits, price_cash, is_for_sale
) VALUES (
  'Dark Magician', 'Monster', 7, 2500, 2100, 'Ultra Rare',
  5000, 100, 4.99, true
);
```

---

## **🎯 PARTE 2: USUÁRIO COMPRA CARTA**

### **Endpoint:**
```
POST /api/shop/purchase
```

### **Request Body:**
```json
{
  "cardId": "uuid-da-carta",
  "paymentMethod": "coins"  // "coins", "credits" ou "cash"
}
```

### **O que acontece no Backend (PASSO A PASSO):**

#### **Passo 1: Buscar Carta**
```typescript
const card = await this.cardRepository.findOne({
  where: { id: purchaseDto.cardId }
});

// Resultado:
// card.priceCoins = 5000
// card.priceCredits = 100
// card.priceCash = 4.99
```

#### **Passo 2: Buscar Usuário**
```typescript
const user = await this.userRepository.findOne({
  where: { id: userId }
});

// Resultado:
// user.coins = 10000    (saldo atual)
// user.credits = 50
// user.cash = 20
```

#### **Passo 3: Verificar Saldo**
```typescript
// Método escolhido: "coins"
const price = card.priceCoins;      // 5000
const userBalance = user.coins;     // 10000

if (userBalance < price) {
  throw new BadRequestException(
    `Saldo insuficiente! Faltam ${price - userBalance} moedas`
  );
}

// ✅ Usuário tem saldo suficiente!
```

#### **Passo 4: Deduzir do Saldo**
```typescript
user.coins -= price;  // 10000 - 5000 = 5000
await this.userRepository.save(user);

// Agora no banco:
// user.coins = 5000 (deduzido!)
```

#### **Passo 5: Adicionar ao Inventário**
```typescript
const userCard = this.userCardRepository.create({
  userId: user.id,
  cardId: card.id,
  quantity: 1,
  acquiredBy: 'PURCHASE'
});

await this.userCardRepository.save(userCard);

// Agora no banco (tabela user_cards):
// INSERT INTO user_cards (user_id, card_id, quantity, acquired_by)
// VALUES ('user-uuid', 'card-uuid', 1, 'PURCHASE');
```

#### **Passo 6: Retornar Resposta**
```typescript
return {
  success: true,
  message: "Carta 'Dark Magician' comprada com sucesso!",
  card: card,
  userCard: userCard,
  remainingBalance: {
    coins: 5000,      // Saldo restante
    credits: 50,
    cash: 20
  }
};
```

---

## **🔍 VERIFICAÇÃO DE SALDO - CÓDIGO COMPLETO**

```typescript
// shop.service.ts
private checkUserBalance(
  user: User,
  card: Card,
  paymentMethod: PaymentMethod
): { price: number; canPurchase: boolean; missingAmount: number } {
  let price = 0;
  let userBalance = 0;

  // Determinar preço baseado no método de pagamento
  switch (paymentMethod) {
    case 'coins':
      price = card.priceCoins || 0;        // ← Pega do banco
      userBalance = user.coins || 0;       // ← Pega do banco
      break;
    case 'credits':
      price = card.priceCredits || 0;
      userBalance = user.credits || 0;
      break;
    case 'cash':
      price = Number(card.priceCash) || 0;
      userBalance = user.cash || 0;
      break;
  }

  // Verificar se carta tem preço para este método
  if (price === 0) {
    throw new BadRequestException(
      `Esta carta não pode ser comprada com ${paymentMethod}`
    );
  }

  // ✅ VALIDAÇÃO CRÍTICA
  const canPurchase = userBalance >= price;
  const missingAmount = canPurchase ? 0 : price - userBalance;

  return { price, canPurchase, missingAmount };
}
```

---

## **🎯 PARTE 3: ADICIONAR EFEITO PELO NOME**

### **Endpoint:**
```
POST /api/cards/effects/add
```

### **Request Body:**
```json
{
  "cardName": "Dark Magician",  // ← BUSCA PELO NOME!
  "effectType": "trigger",
  "timing": ["special-summon"],
  "action": "destroy",
  "target": "opponent",
  "params": { "cardType": "spell-trap", "amount": 1 },
  "condition": "When this card is Special Summoned"
}
```

### **O que acontece no Backend:**

#### **Passo 1: Buscar Carta pelo Nome**
```typescript
// cards.service.ts
async findByNameExact(name: string): Promise<Card | null> {
  return this.cardsRepository.findOne({
    where: { name }  // ← BUSCA EXATA PELO NOME
  });
}
```

#### **Passo 2: Adicionar Efeito**
```typescript
async addEffectToCard(addEffectDto: AddEffectDto) {
  // 1. Buscar carta pelo nome
  const card = await this.findByNameExact(addEffectDto.cardName);
  
  if (!card) {
    throw new NotFoundException(
      `Carta "${addEffectDto.cardName}" não encontrada`
    );
  }

  // 2. Criar objeto de efeito
  const effect = {
    type: addEffectDto.effectType,
    timing: addEffectDto.timing,
    condition: addEffectDto.condition,
    action: addEffectDto.action,
    target: addEffectDto.target,
    params: addEffectDto.params,
  };

  // 3. Adicionar efeito à carta
  card.effect = effect;
  
  // 4. Salvar no banco (coluna effect JSONB)
  return this.cardsRepository.save(card);
}
```

#### **Resultado no Banco:**
```sql
UPDATE cards
SET effect = '{
  "type": "trigger",
  "timing": ["special-summon"],
  "action": "destroy",
  "target": "opponent",
  "params": { "cardType": "spell-trap", "amount": 1 },
  "condition": "When this card is Special Summoned"
}'::jsonb
WHERE name = 'Dark Magician';
```

---

## **📊 EXEMPLOS PRÁTICOS**

### **Exemplo 1: Usuário SEM Saldo Suficiente**

```typescript
// Usuário tem:
user.coins = 1000

// Carta custa:
card.priceCoins = 5000

// Resultado:
❌ BadRequestException: "Saldo insuficiente! Faltam 4000 moedas"
```

### **Exemplo 2: Usuário COM Saldo Suficiente**

```typescript
// Usuário tem:
user.coins = 10000

// Carta custa:
card.priceCoins = 5000

// Resultado:
✅ Compra realizada
user.coins = 5000 (deduzido)
user_cards: nova entrada criada
```

### **Exemplo 3: Múltiplas Moedas**

```typescript
// Carta tem 3 preços:
card.priceCoins = 5000
card.priceCredits = 100
card.priceCash = 4.99

// Usuário escolhe: "credits"
{
  "cardId": "uuid",
  "paymentMethod": "credits"  // ← Usa créditos
}

// Backend verifica:
user.credits >= card.priceCredits  // ✅
user.credits -= 100                // Deduz
```

---

## **🔄 FLUXO COMPLETO - DIAGRAMA**

```
┌─────────────────────────────────────────────────────┐
│ 1. ADMIN CRIA CARTA                                 │
│    POST /api/cards                                  │
│    { name, priceCoins, priceCredits, priceCash }    │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ 2. CARTA SALVA NO BANCO (tabela: cards)            │
│    cards.price_coins = 5000                         │
│    cards.price_credits = 100                        │
│    cards.price_cash = 4.99                          │
│    cards.is_for_sale = true                         │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ 3. USUÁRIO TENTA COMPRAR                            │
│    POST /api/shop/purchase                          │
│    { cardId, paymentMethod: "coins" }               │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ 4. BACKEND BUSCA DADOS                              │
│    - Busca carta: SELECT * FROM cards WHERE id=...  │
│    - Busca user: SELECT * FROM users WHERE id=...   │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ 5. VERIFICA SALDO                                   │
│    price = card.priceCoins (5000)                   │
│    userBalance = user.coins (10000)                 │
│    if (userBalance < price) → ERRO                  │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼ ✅ Saldo OK
┌─────────────────────────────────────────────────────┐
│ 6. DEDUZ DO SALDO                                   │
│    user.coins -= price  (10000 - 5000 = 5000)      │
│    UPDATE users SET coins = 5000 WHERE id=...       │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ 7. ADICIONA AO INVENTÁRIO                           │
│    INSERT INTO user_cards                           │
│    (user_id, card_id, quantity, acquired_by)        │
│    VALUES (userId, cardId, 1, 'PURCHASE')           │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ 8. RETORNA SUCESSO                                  │
│    { success: true, remainingBalance: 5000 }        │
└─────────────────────────────────────────────────────┘
```

---

## **📋 ENDPOINTS DISPONÍVEIS**

### **1. Criar Carta**
```
POST /api/cards
Body: { name, priceCoins, priceCredits, priceCash, isForSale, ... }
```

### **2. Adicionar Efeito (Pelo Nome)**
```
POST /api/cards/effects/add
Body: { cardName, effectType, action, params, ... }
```

### **3. Comprar Carta**
```
POST /api/shop/purchase
Body: { cardId, paymentMethod: "coins" | "credits" | "cash" }
```

### **4. Ver Inventário**
```
GET /api/shop/inventory
Headers: Authorization: Bearer TOKEN
```

### **5. Adicionar Saldo (Admin)**
```
POST /api/shop/admin/add-balance
Body: { userId, amount, currency: "coins" | "credits" | "cash" }
```

---

## **✅ CHECKLIST - SISTEMA COMPLETO**

- [x] **Card Entity** com campos de preço (priceCoins, priceCredits, priceCash)
- [x] **User Entity** com campos de saldo (coins, credits, cash)
- [x] **UserCard Entity** para inventário
- [x] **ShopService** com verificação de saldo
- [x] **Dedução automática** do saldo após compra
- [x] **Adição automática** ao inventário
- [x] **Sistema de efeitos** por nome da carta
- [x] **Endpoints completos** (criar, comprar, inventário)

---

## **🚀 EXEMPLO DE USO COMPLETO**

```bash
# 1️⃣ CRIAR CARTA COM PREÇOS
curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dark Magician",
    "type": "Monster",
    "level": 7,
    "atk": 2500,
    "def": 2100,
    "rarity": "Ultra Rare",
    "priceCoins": 5000,
    "priceCredits": 100,
    "priceCash": 4.99,
    "isForSale": true
  }'

# 2️⃣ ADICIONAR EFEITO PELO NOME
curl -X POST http://localhost:3000/api/cards/effects/add \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cardName": "Dark Magician",
    "effectType": "trigger",
    "action": "destroy",
    "params": { "amount": 1 }
  }'

# 3️⃣ DAR SALDO AO USUÁRIO (Admin)
curl -X POST http://localhost:3000/api/shop/admin/add-balance \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-uuid",
    "amount": 10000,
    "currency": "coins"
  }'

# 4️⃣ USUÁRIO COMPRA CARTA
curl -X POST http://localhost:3000/api/shop/purchase \
  -H "Authorization: Bearer USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cardId": "card-uuid",
    "paymentMethod": "coins"
  }'

# 5️⃣ VER INVENTÁRIO
curl http://localhost:3000/api/shop/inventory \
  -H "Authorization: Bearer USER_TOKEN"
```

**Sistema está 100% FUNCIONAL!** 🎉
