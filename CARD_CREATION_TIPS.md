# 💡 DICAS - SISTEMA DE CRIAÇÃO DE CARTAS E EFEITOS

## **🎯 RESUMO EXECUTIVO**

### **Como Funciona:**
1. ✅ **Criar a carta** com preços (coins/credits/cash)
2. ✅ **Buscar carta pelo nome** para adicionar efeito
3. ✅ **Carta aparece automaticamente** na loja se `isForSale: true`

---

## **📌 WORKFLOW RECOMENDADO**

### **Opção 1: Criar tudo de uma vez**
```json
POST /api/cards
{
  "name": "Dark Magician",
  "type": "Monster",
  "level": 7,
  "atk": 2500,
  "def": 2100,
  "rarity": "Ultra Rare",
  "priceCoins": 5000,
  "priceCredits": 100,
  "priceCash": 4.99,
  "isForSale": true,
  "effect": {
    "type": "trigger",
    "action": "destroy",
    "params": { "amount": 1 }
  }
}
```

### **Opção 2: Criar em 2 passos (RECOMENDADO)**
```bash
# Passo 1: Criar carta SEM efeito
POST /api/cards
{
  "name": "Dark Magician",
  "priceCoins": 5000,
  ...
}

# Passo 2: Adicionar efeito pelo NOME
POST /api/cards/effects/add
{
  "cardName": "Dark Magician",  ← Busca pelo nome
  "effectType": "trigger",
  "action": "destroy"
}
```

---

## **💰 SISTEMA DE PREÇOS**

### **3 Tipos de Moeda:**

| Campo | Quando Usar | Exemplo |
|-------|-------------|---------|
| `priceCoins` | Cartas **normais** (ganhas jogando) | `5000` moedas |
| `priceCredits` | Cartas **premium** (compradas no jogo) | `100` créditos |
| `priceCash` | Cartas **exclusivas** (dinheiro real) | `4.99` reais |

### **Exemplos:**

```json
// 1️⃣ CARTA COMUM (só moedas)
{
  "name": "Mystical Elf",
  "priceCoins": 1000,
  "isForSale": true
}

// 2️⃣ CARTA PREMIUM (só créditos)
{
  "name": "Blue-Eyes",
  "priceCredits": 200,
  "isForSale": true
}

// 3️⃣ CARTA EXCLUSIVA (só dinheiro real)
{
  "name": "Exodia",
  "priceCash": 9.99,
  "isForSale": true
}

// 4️⃣ MÚLTIPLAS OPÇÕES (jogador escolhe)
{
  "name": "Dark Magician",
  "priceCoins": 5000,      // OU
  "priceCredits": 100,     // OU
  "priceCash": 4.99,       // OU
  "isForSale": true
}

// 5️⃣ CARTA GRATUITA (drop de duelo)
{
  "name": "Kuriboh",
  "isForSale": false  // Não aparece na loja
}
```

---

## **✨ SISTEMA DE EFEITOS**

### **Por que BUSCAR PELO NOME?**

#### ❌ PROBLEMA: Buscar por ID
```json
POST /api/cards/effects/add
{
  "cardId": "abc-123-def-456"  ← Você não sabe o ID!
}
```

#### ✅ SOLUÇÃO: Buscar por NOME
```json
POST /api/cards/effects/add
{
  "cardName": "Dark Magician"  ← Você sabe o nome!
}
```

### **Backend Busca Automaticamente:**
```typescript
// No backend:
async addEffectToCard(addEffectDto: AddEffectDto) {
  // Busca pelo nome exato
  const card = await this.findByNameExact(addEffectDto.cardName);
  
  if (!card) {
    throw new NotFoundException(`Carta "${addEffectDto.cardName}" não encontrada`);
  }
  
  // Adiciona efeito
  card.effect = { ...addEffectDto };
  return this.save(card);
}
```

---

## **🎯 TIPOS DE EFEITOS**

### **1. CONTINUOUS (Sempre Ativo)**
```json
{
  "cardName": "Mystical Elf",
  "effectType": "continuous",
  "action": "gain-lp",
  "params": { "amount": 500 },
  "timing": ["standby-phase"]
}
```
**Resultado:** Ganha 500 LP todo turno

### **2. TRIGGER (Ativa Automaticamente)**
```json
{
  "cardName": "Sangan",
  "effectType": "trigger",
  "timing": ["sent-to-graveyard"],
  "action": "search",
  "params": { "from": "deck", "atk": "<=1500" },
  "condition": "When this card is sent to the Graveyard"
}
```
**Resultado:** Quando vai pro cemitério, busca carta do deck

### **3. IGNITION (Ativa Manualmente)**
```json
{
  "cardName": "Pot of Greed",
  "effectType": "ignition",
  "timing": ["main-phase"],
  "action": "draw",
  "params": { "amount": 2 }
}
```
**Resultado:** Jogador ativa para comprar 2 cartas

### **4. QUICK (Ativa a Qualquer Momento)**
```json
{
  "cardName": "Mystical Space Typhoon",
  "effectType": "quick",
  "timing": ["any"],
  "action": "destroy",
  "target": "opponent",
  "params": { "cardType": "spell-trap" }
}
```
**Resultado:** Pode ativar no turno do oponente

### **5. FLIP (Ativa Quando Virado)**
```json
{
  "cardName": "Man-Eater Bug",
  "effectType": "flip",
  "action": "destroy",
  "target": "opponent",
  "params": { "cardType": "monster", "amount": 1 }
}
```
**Resultado:** Quando virado, destrói 1 monstro

---

## **📚 USAR TEMPLATES PRONTOS**

### **1. Listar Templates:**
```bash
GET /api/cards/effects/templates
```

### **2. Resposta:**
```json
{
  "drawCards": { ... },
  "destroyCard": { ... },
  "specialSummon": { ... },
  "gainLP": { ... },
  "negateEffect": { ... },
  ...
}
```

### **3. Usar Template:**
```javascript
// Frontend
const templates = await fetch('/api/cards/effects/templates');
const drawEffect = templates.drawCards;

// Adicionar à carta
await fetch('/api/cards/effects/add', {
  method: 'POST',
  body: JSON.stringify({
    cardName: "My Card",
    ...drawEffect  // ← Usa template pronto
  })
});
```

---

## **🔍 BUSCAR CARTAS SEM EFEITO**

### **Endpoint:**
```bash
GET /api/cards/effects/without-effects
```

### **Resposta:**
```json
[
  {
    "id": "abc-123",
    "name": "Blue-Eyes White Dragon",
    "type": "Monster",
    "effect": null  // ← Sem efeito ainda
  },
  {
    "id": "def-456",
    "name": "Celtic Guardian",
    "type": "Monster",
    "effect": null
  }
]
```

### **Adicionar Efeito:**
```bash
POST /api/cards/effects/add
{
  "cardName": "Blue-Eyes White Dragon",
  "effectType": "continuous",
  "action": "atk-boost",
  "params": { "amount": 500 }
}
```

---

## **🛒 LOJA AUTOMÁTICA**

### **Quando Você Cria uma Carta:**

```json
POST /api/cards
{
  "name": "Dark Magician",
  "priceCoins": 5000,
  "isForSale": true  ← Carta aparece na loja!
}
```

### **Backend Faz Automaticamente:**
```typescript
async create(cardData: CreateCardDto) {
  const card = await this.cardsRepository.save(cardData);
  
  // Adiciona à loja automaticamente
  if (card.isForSale) {
    await this.shopService.addCardToShop(card);
  }
  
  return card;
}
```

### **Buscar Cartas na Loja:**
```bash
GET /api/cards/shop/for-sale
```

**Resposta:**
```json
[
  {
    "id": "abc-123",
    "name": "Dark Magician",
    "rarity": "Ultra Rare",
    "priceCoins": 5000,
    "priceCredits": 100,
    "priceCash": 4.99,
    "isForSale": true
  }
]
```

---

## **⚠️ DICAS IMPORTANTES**

### **1. Nome da Carta é CASE-SENSITIVE**
```json
✅ CERTO:
{ "cardName": "Dark Magician" }

❌ ERRADO:
{ "cardName": "dark magician" }
{ "cardName": "DARK MAGICIAN" }
```

### **2. Preços são OPCIONAIS**
```json
// Carta grátis:
{
  "name": "Kuriboh",
  "isForSale": false  // Não precisa preço
}

// Só moedas:
{
  "name": "Celtic Guardian",
  "priceCoins": 500,
  "isForSale": true
}

// Múltiplas opções:
{
  "name": "Dark Magician",
  "priceCoins": 5000,
  "priceCredits": 100,
  "priceCash": 4.99,
  "isForSale": true
}
```

### **3. Efeito é OPCIONAL**
```bash
# Criar carta SEM efeito (Normal Monster)
POST /api/cards
{
  "name": "Blue-Eyes White Dragon",
  "monsterType": "Normal",
  ...
}
# ✅ Válido! Carta normal não precisa de efeito
```

### **4. Usar Templates para Acelerar**
```bash
# Pegar template pronto
GET /api/cards/effects/templates

# Copiar e usar
POST /api/cards/effects/add
{
  "cardName": "My Card",
  ...template  # ← Cola aqui
}
```

---

## **📋 CHECKLIST - CRIAR CARTA COMPLETA**

```
✅ Criar carta com informações básicas
✅ Definir preços (coins/credits/cash)
✅ Marcar isForSale: true
✅ Adicionar efeito pelo nome (se necessário)
✅ Carta aparece automaticamente na loja
✅ Testar compra
```

---

## **🚀 EXEMPLO COMPLETO - DARK MAGICIAN**

### **1. Criar Carta:**
```bash
curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
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
    "priceCoins": 5000,
    "priceCredits": 100,
    "priceCash": 4.99,
    "isForSale": true
  }'
```

### **2. Adicionar Efeito:**
```bash
curl -X POST http://localhost:3000/api/cards/effects/add \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cardName": "Dark Magician",
    "effectType": "trigger",
    "timing": ["special-summon"],
    "action": "destroy",
    "target": "opponent",
    "params": { "cardType": "spell-trap", "amount": 1 },
    "condition": "When this card is Special Summoned"
  }'
```

### **3. Verificar na Loja:**
```bash
curl http://localhost:3000/api/cards/shop/for-sale
```

**Pronto! Carta criada, com efeito e na loja!** 🎉

---

## **💡 RESUMO FINAL**

### **Por que Buscar por Nome?**
- ✅ **Fácil de lembrar** (você sabe o nome)
- ✅ **Não precisa guardar ID** (banco faz isso)
- ✅ **Nome é único** (não tem duplicatas)
- ✅ **Mais prático** no backend

### **Sistema de Preços:**
- 🪙 **Moedas** = Jogando duelos
- 💎 **Créditos** = Compra premium no jogo
- 💵 **Cash** = Dinheiro real (R$, USD)

### **Sistema de Efeitos:**
- 📚 **Templates prontos** = Acelera criação
- 🔍 **Busca por nome** = Fácil integração
- ✨ **JSONB flexível** = Qualquer tipo de efeito
- 🎯 **5 tipos** = continuous, trigger, ignition, quick, flip

**Sistema está PRONTO para criar cartas completas!** 🚀
