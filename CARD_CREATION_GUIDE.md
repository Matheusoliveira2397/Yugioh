# 🎴 SISTEMA DE CRIAÇÃO DE CARTAS - GUIA COMPLETO

## **📋 ÍNDICE**
1. [Criação de Carta Básica](#1-criação-de-carta-básica)
2. [Adicionar Preços (Cash/Créditos)](#2-adicionar-preços-cashcréditos)
3. [Sistema de Efeitos](#3-sistema-de-efeitos)
4. [Templates de Efeitos Prontos](#4-templates-de-efeitos-prontos)
5. [Como Adicionar Efeito pelo Nome](#5-como-adicionar-efeito-pelo-nome)
6. [Exemplos Práticos](#6-exemplos-práticos)
7. [Fluxo Completo](#7-fluxo-completo)

---

## **1. CRIAÇÃO DE CARTA BÁSICA**

### **Endpoint:**
```
POST /api/cards
```

### **Headers:**
```json
{
  "Authorization": "Bearer YOUR_ADMIN_TOKEN",
  "Content-Type": "application/json"
}
```

### **Body - Monstro Normal:**
```json
{
  "name": "Dark Magician",
  "nameEn": "Dark Magician",
  "description": "The ultimate wizard in terms of attack and defense.",
  "cardImage": "/images/cards/dark-magician.webp",
  
  "type": "Monster",
  "monsterType": "Effect",
  "attribute": "DARK",
  "race": "Spellcaster",
  
  "level": 7,
  "atk": 2500,
  "def": 2100,
  
  "rarity": "Ultra Rare",
  "maxCopiesInDeck": 3,
  
  "priceCoins": 5000,
  "priceCredits": 100,
  "priceCash": 4.99,
  "isForSale": true,
  "isActive": true
}
```

### **Body - Carta de Magia:**
```json
{
  "name": "Pot of Greed",
  "description": "Draw 2 cards.",
  "cardImage": "/images/cards/pot-of-greed.webp",
  
  "type": "Spell",
  "rarity": "Rare",
  
  "priceCoins": 1000,
  "priceCredits": 50,
  "isForSale": true
}
```

### **Body - Carta de Armadilha:**
```json
{
  "name": "Mirror Force",
  "description": "When an opponent's monster declares an attack: Destroy all Attack Position monsters your opponent controls.",
  "cardImage": "/images/cards/mirror-force.webp",
  
  "type": "Trap",
  "rarity": "Super Rare",
  
  "priceCoins": 3000,
  "priceCredits": 75,
  "priceCash": 2.99,
  "isForSale": true
}
```

---

## **2. ADICIONAR PREÇOS (CASH/CRÉDITOS)**

### **Tipos de Moeda:**

| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `priceCoins` | `integer` | Moedas do jogo (ganhas jogando) | `5000` |
| `priceCredits` | `integer` | Créditos premium | `100` |
| `priceCash` | `decimal` | Dinheiro real (R$, USD) | `4.99` |
| `isForSale` | `boolean` | Se está disponível na loja | `true` |

### **Exemplo - Carta com 3 Opções de Compra:**
```json
{
  "name": "Blue-Eyes White Dragon",
  "description": "This legendary dragon is a powerful engine of destruction.",
  "type": "Monster",
  "monsterType": "Normal",
  "attribute": "LIGHT",
  "race": "Dragon",
  "level": 8,
  "atk": 3000,
  "def": 2500,
  "rarity": "Ultra Rare",
  
  "priceCoins": 10000,      // ← Pode comprar com moedas
  "priceCredits": 200,      // ← OU com créditos
  "priceCash": 9.99,        // ← OU com dinheiro real
  "isForSale": true
}
```

### **Endpoint para Buscar Cartas na Loja:**
```
GET /api/cards/shop/for-sale
```

**Resposta:**
```json
[
  {
    "id": "uuid-123",
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

## **3. SISTEMA DE EFEITOS**

### **Estrutura do Efeito (JSONB):**

```typescript
{
  type: 'continuous' | 'trigger' | 'ignition' | 'quick' | 'flip',
  timing?: string[],        // Quando ativa: ['summon', 'attack', 'end-phase']
  condition?: string,       // Condição para ativar
  action: string,          // O que o efeito faz: 'draw', 'destroy', etc
  target?: string,         // Alvo: 'opponent', 'self', 'all'
  params?: any,            // Parâmetros específicos
  cost?: any              // Custo para ativar
}
```

### **Tipos de Efeitos:**

| Tipo | Descrição | Exemplo |
|------|-----------|---------|
| `continuous` | Sempre ativo | Ganha 500 LP todo turno |
| `trigger` | Ativa em momento específico | Quando invocado, destrói 1 carta |
| `ignition` | Ativado manualmente | Descarte 1 carta para comprar 2 |
| `quick` | Pode ativar a qualquer momento | Negar ativação de magia |
| `flip` | Ativa quando virado | Quando virado, destrói monstro |

---

## **4. TEMPLATES DE EFEITOS PRONTOS**

### **Endpoint para Ver Templates:**
```
GET /api/cards/effects/templates
```

**Resposta - Templates Disponíveis:**

```json
{
  "drawCards": {
    "type": "ignition",
    "timing": ["main-phase"],
    "action": "draw",
    "target": "self",
    "params": { "amount": 2 },
    "cost": { "type": "discard", "amount": 1 }
  },
  
  "destroyCard": {
    "type": "ignition",
    "timing": ["main-phase"],
    "action": "destroy",
    "target": "opponent",
    "params": { "cardType": "monster" },
    "cost": { "type": "tribute", "amount": 1 }
  },
  
  "specialSummon": {
    "type": "trigger",
    "timing": ["summon"],
    "action": "special-summon",
    "target": "self",
    "params": { "from": "hand", "level": 4 },
    "condition": "when this card is normal summoned"
  },
  
  "gainLP": {
    "type": "continuous",
    "action": "gain-lp",
    "target": "self",
    "params": { "amount": 500 },
    "timing": ["standby-phase"]
  },
  
  "negateEffect": {
    "type": "quick",
    "timing": ["any"],
    "action": "negate",
    "target": "opponent",
    "params": { "effectType": "spell-trap" },
    "cost": { "type": "discard", "amount": 1 }
  }
}
```

---

## **5. COMO ADICIONAR EFEITO PELO NOME**

### **✅ MÉTODO RECOMENDADO: Buscar pelo Nome**

### **Passo 1: Criar a Carta SEM Efeito**
```bash
POST /api/cards
```

```json
{
  "name": "Mystical Elf",
  "type": "Monster",
  "monsterType": "Effect",
  "attribute": "LIGHT",
  "race": "Spellcaster",
  "level": 4,
  "atk": 800,
  "def": 2000,
  "rarity": "Rare",
  "priceCoins": 1000,
  "isForSale": true
}
```

### **Passo 2: Adicionar Efeito pelo Nome da Carta**
```bash
POST /api/cards/effects/add
```

```json
{
  "cardName": "Mystical Elf",
  "effectType": "continuous",
  "action": "gain-lp",
  "target": "self",
  "params": { "amount": 1000 },
  "timing": ["standby-phase"]
}
```

**Resposta:**
```json
{
  "id": "uuid-456",
  "name": "Mystical Elf",
  "effect": {
    "type": "continuous",
    "action": "gain-lp",
    "target": "self",
    "params": { "amount": 1000 },
    "timing": ["standby-phase"]
  }
}
```

---

## **6. EXEMPLOS PRÁTICOS**

### **Exemplo 1: Dark Magician com Efeito**

**1. Criar a carta:**
```json
POST /api/cards
{
  "name": "Dark Magician",
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
  "isForSale": true
}
```

**2. Adicionar efeito:**
```json
POST /api/cards/effects/add
{
  "cardName": "Dark Magician",
  "effectType": "trigger",
  "timing": ["summon"],
  "action": "destroy",
  "target": "opponent",
  "params": { "cardType": "spell-trap", "amount": 1 },
  "condition": "When this card is Special Summoned"
}
```

---

### **Exemplo 2: Pot of Greed**

**1. Criar:**
```json
POST /api/cards
{
  "name": "Pot of Greed",
  "type": "Spell",
  "description": "Draw 2 cards.",
  "rarity": "Rare",
  "priceCoins": 1000,
  "isForSale": true
}
```

**2. Adicionar efeito:**
```json
POST /api/cards/effects/add
{
  "cardName": "Pot of Greed",
  "effectType": "ignition",
  "timing": ["main-phase"],
  "action": "draw",
  "target": "self",
  "params": { "amount": 2 }
}
```

---

### **Exemplo 3: Mirror Force**

**1. Criar:**
```json
POST /api/cards
{
  "name": "Mirror Force",
  "type": "Trap",
  "rarity": "Super Rare",
  "priceCoins": 3000,
  "priceCash": 2.99,
  "isForSale": true
}
```

**2. Adicionar efeito:**
```json
POST /api/cards/effects/add
{
  "cardName": "Mirror Force",
  "effectType": "trigger",
  "timing": ["opponent-attack"],
  "action": "destroy",
  "target": "opponent",
  "params": { "position": "attack", "amount": "all" },
  "condition": "When an opponent's monster declares an attack"
}
```

---

## **7. FLUXO COMPLETO**

### **📌 Workflow Recomendado:**

```
1. CRIAR CARTA
   ↓
   POST /api/cards
   (Nome, tipo, atk, def, preços, etc)
   
2. ADICIONAR EFEITO (se necessário)
   ↓
   POST /api/cards/effects/add
   (Busca pelo nome e adiciona efeito)
   
3. CARTA APARECE NA LOJA
   ↓
   GET /api/cards/shop/for-sale
   (Automaticamente disponível)
   
4. JOGADOR COMPRA
   ↓
   POST /api/shop/buy
   (Usa coins, credits ou cash)
```

---

## **📋 ENDPOINTS ÚTEIS**

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/cards` | Listar todas as cartas ativas |
| `GET` | `/api/cards/:id` | Buscar carta por ID |
| `GET` | `/api/cards/search/by-name?name=Dark` | Buscar por nome |
| `GET` | `/api/cards/shop/for-sale` | Cartas disponíveis na loja |
| `GET` | `/api/cards/effects/with-effects` | Cartas com efeitos |
| `GET` | `/api/cards/effects/without-effects` | Cartas sem efeitos |
| `GET` | `/api/cards/effects/templates` | Templates prontos |
| `POST` | `/api/cards` | Criar carta |
| `POST` | `/api/cards/effects/add` | Adicionar efeito pelo nome |
| `PUT` | `/api/cards/:id` | Atualizar carta |
| `DELETE` | `/api/cards/:id` | Desativar carta |
| `DELETE` | `/api/cards/effects/:cardName` | Remover efeito |

---

## **💡 DICAS IMPORTANTES**

### **1. Nome da Carta é ÚNICO**
```json
✅ CERTO:
{
  "cardName": "Dark Magician"  // Nome EXATO
}

❌ ERRADO:
{
  "cardName": "dark magician"  // Minúsculo não vai encontrar
}
```

### **2. Usar Template Pronto**
```javascript
// Pegar template pronto:
const templates = await fetch('/api/cards/effects/templates');
const drawEffect = templates.drawCards;

// Adicionar à carta:
POST /api/cards/effects/add
{
  "cardName": "My Custom Card",
  ...drawEffect  // ← Usa o template
}
```

### **3. Preços Opcionais**
```json
// Carta grátis (drop de duelo):
{
  "priceCoins": null,
  "priceCredits": null,
  "priceCash": null,
  "isForSale": false  // ← Não aparece na loja
}

// Só com moedas:
{
  "priceCoins": 1000,
  "isForSale": true
}

// Premium (só cash):
{
  "priceCash": 9.99,
  "isForSale": true
}
```

---

## **🔍 BUSCAR CARTAS SEM EFEITO PARA ADICIONAR**

```bash
GET /api/cards/effects/without-effects
```

**Resposta:**
```json
[
  {
    "id": "uuid-789",
    "name": "Blue-Eyes White Dragon",
    "type": "Monster",
    "effect": null  // ← Sem efeito ainda
  }
]
```

Depois adicionar:
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

## **✅ RESUMO - 3 PASSOS SIMPLES**

```bash
# 1️⃣ CRIAR CARTA
curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Custom Card",
    "type": "Monster",
    "level": 4,
    "atk": 1500,
    "def": 1000,
    "priceCoins": 2000,
    "isForSale": true
  }'

# 2️⃣ ADICIONAR EFEITO (PELO NOME)
curl -X POST http://localhost:3000/api/cards/effects/add \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cardName": "My Custom Card",
    "effectType": "ignition",
    "action": "draw",
    "params": { "amount": 1 }
  }'

# 3️⃣ BUSCAR NA LOJA
curl http://localhost:3000/api/cards/shop/for-sale
```

**Pronto! A carta está criada, com efeito e disponível na loja!** 🎉
