# 🎴 Sistema Completo de Registro de Cartas

## 📋 Visão Geral

Sistema completo para criação e gerenciamento de cartas Yu-Gi-Oh com integração automática com a loja.

## ✨ Funcionalidades

### 🔧 Backend

#### **Enums Adicionados**

**SpellType** (6 tipos):
- Normal
- Continuous
- Equip
- Field
- Quick-Play
- Ritual

**TrapType** (3 tipos):
- Normal
- Continuous
- Counter

**MonsterRace** (25 raças):
- Warrior, Spellcaster, Fairy, Fiend
- Zombie, Machine, Aqua, Pyro
- Rock, Winged Beast, Plant, Insect
- Thunder, Dragon, Beast, Beast-Warrior
- Dinosaur, Fish, Sea Serpent, Reptile
- Psychic, Divine-Beast, Creator God
- Wyrm, Cyberse

#### **Campos da Carta**

**Informações Básicas:**
- `name` - Nome da carta (obrigatório)
- `nameEn` - Nome em inglês (opcional)
- `description` - Descrição/efeito
- `cardImage` - URL da imagem
- `type` - Monster/Spell/Trap
- `rarity` - Common/Rare/Super Rare/Ultra Rare/Secret Rare/Legendary

**Campos de Monstro (condicionais):**
- `monsterType` - Normal/Effect/Ritual/Fusion/Synchro/Xyz/Pendulum/Link
- `attribute` - DARK/LIGHT/WATER/FIRE/EARTH/WIND/DIVINE
- `race` - 25 opções (Warrior, Dragon, etc)
- `level` - 1-12 (não para Link/Xyz)
- `rank` - 1-12 (somente Xyz)
- `linkRating` - 1-8 (somente Link)
- `atk` - Ataque (0+)
- `def` - Defesa (0+, não para Link)
- `pendulumScale` - 0-13 (somente Pendulum)
- `pendulumEffect` - Texto do efeito pêndulo

**Campos de Spell (condicionais):**
- `spellType` - Normal/Continuous/Equip/Field/Quick-Play/Ritual

**Campos de Trap (condicionais):**
- `trapType` - Normal/Continuous/Counter

**Preços:**
- `priceCoins` - Preço em moedas do jogo
- `priceCredits` - Preço em créditos premium
- `priceCash` - Preço em dinheiro real (R$)
- `isForSale` - Se está disponível na loja

**Campos Avançados:**
- `archetype` - Arquétipo (ex: Blue-Eyes, Dark Magician)
- `isBanned` - Se a carta é banida
- `isLimited` - Se a carta é limitada
- `effects` - JSONB para efeitos complexos

---

### 🎨 Frontend

#### **Formulário Inteligente**

O formulário se adapta ao tipo de carta selecionado:

**Quando Monster:**
- Tipo de monstro (8 opções)
- Atributo com ícones (7 opções)
- Raça (25 opções)
- Level/Rank/Link Rating (condicional ao tipo)
- ATK (sempre)
- DEF (oculto para Link)
- Pendulum Scale e Effect (somente Pendulum)

**Quando Spell:**
- Tipo de Spell com ícones (6 opções)

**Quando Trap:**
- Tipo de Trap com ícones (3 opções)

**Seção de Preços:**
- 🪙 Moedas (inteiro)
- 💎 Créditos (inteiro)
- 💵 Dinheiro R$ (decimal)
- ✅ Checkbox "Disponível na Loja"

**Seção Avançada:**
- Arquétipo
- Nome em Inglês
- ⛔ Banida
- ⚠️ Limitada

---

## 🔄 Fluxo de Criação

### **1. Admin Preenche Formulário**

```typescript
// Exemplo: Criar Dark Magician
{
  name: "Dark Magician",
  nameEn: "Dark Magician",
  description: "The ultimate wizard in terms of attack and defense.",
  type: "Monster",
  monsterType: "Normal",
  attribute: "DARK",
  race: "Spellcaster",
  level: 7,
  atk: 2500,
  def: 2100,
  rarity: "Ultra Rare",
  priceCoins: 10000,
  priceCredits: 500,
  priceCash: 9.99,
  isForSale: true,
  archetype: "Dark Magician"
}
```

### **2. Backend Processa**

**CardsController** recebe o request:
```typescript
POST /api/cards
```

**CardsService.create()**:
1. Valida dados com CreateCardDto
2. Cria a carta no banco (tabela `cards`)
3. Se `isForSale = true`:
   - Chama `ShopService.addCardToShop()`
   - Cria entrada em `shop_items`

### **3. Integração Automática com Loja**

**ShopService.addCardToShop()**:
```typescript
{
  cardId: savedCard.id,
  priceCoins: savedCard.priceCoins,
  priceCredits: savedCard.priceCredits,
  priceCash: savedCard.priceCash,
  isAvailable: true,
  stock: -1 // Ilimitado
}
```

### **4. Carta Aparece na Loja**

- `/shop` lista todos os `shop_items` com `isAvailable = true`
- JOIN com tabela `cards` para pegar detalhes
- Usuário pode comprar com moedas, créditos ou dinheiro

---

## 🗄️ Estrutura de Banco

### **Tabela: cards**

```sql
CREATE TABLE cards (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,
  nameEn VARCHAR,
  description TEXT,
  cardImage VARCHAR,
  type ENUM('Monster','Spell','Trap') NOT NULL,
  
  -- Monstro
  monsterType ENUM('Normal','Effect','Ritual','Fusion','Synchro','Xyz','Pendulum','Link'),
  attribute ENUM('DARK','LIGHT','WATER','FIRE','EARTH','WIND','DIVINE'),
  race ENUM('Warrior','Spellcaster',...), -- 25 opções
  level INT,
  rank INT,
  linkRating INT,
  atk INT,
  def INT,
  pendulumScale INT,
  pendulumEffect VARCHAR,
  
  -- Spell/Trap
  spellType ENUM('Normal','Continuous','Equip','Field','Quick-Play','Ritual'),
  trapType ENUM('Normal','Continuous','Counter'),
  
  -- Preços
  priceCoins INT DEFAULT 0,
  priceCredits INT DEFAULT 0,
  priceCash DECIMAL(10,2) DEFAULT 0,
  isForSale BOOLEAN DEFAULT false,
  
  -- Avançado
  rarity ENUM('Common','Rare','Super Rare','Ultra Rare','Secret Rare','Legendary'),
  archetype VARCHAR,
  isBanned BOOLEAN DEFAULT false,
  isLimited BOOLEAN DEFAULT false,
  effects JSONB,
  
  isActive BOOLEAN DEFAULT true,
  createdAt TIMESTAMP DEFAULT NOW()
);
```

### **Tabela: shop_items**

```sql
CREATE TABLE shop_items (
  id UUID PRIMARY KEY,
  cardId UUID REFERENCES cards(id),
  priceCoins INT DEFAULT 0,
  priceCredits INT DEFAULT 0,
  priceCash DECIMAL(10,2) DEFAULT 0,
  isAvailable BOOLEAN DEFAULT true,
  stock INT DEFAULT -1, -- -1 = ilimitado
  createdAt TIMESTAMP DEFAULT NOW()
);
```

---

## 📡 API Endpoints

### **POST /api/cards**

**Criar nova carta (Admin)**

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
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
  "priceCoins": 15000,
  "priceCredits": 750,
  "priceCash": 14.99,
  "isForSale": true,
  "archetype": "Blue-Eyes"
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Blue-Eyes White Dragon",
  "type": "Monster",
  "isForSale": true,
  "createdAt": "2024-01-20T10:00:00Z",
  "message": "Carta criada e adicionada à loja com sucesso!"
}
```

### **GET /api/shop/items**

**Listar itens da loja**

**Response:**
```json
[
  {
    "id": "uuid",
    "card": {
      "id": "uuid",
      "name": "Blue-Eyes White Dragon",
      "type": "Monster",
      "rarity": "Ultra Rare",
      "cardImage": "/images/cards/blue-eyes.jpg"
    },
    "priceCoins": 15000,
    "priceCredits": 750,
    "priceCash": 14.99,
    "isAvailable": true
  }
]
```

---

## 🎯 Validações

### **Backend (class-validator)**

```typescript
// Monster obrigatório
@ValidateIf(o => o.type === CardType.MONSTER)
@IsEnum(MonsterType)
monsterType?: MonsterType;

// Spell obrigatório
@ValidateIf(o => o.type === CardType.SPELL)
@IsEnum(SpellType)
spellType?: SpellType;

// Trap obrigatório
@ValidateIf(o => o.type === CardType.TRAP)
@IsEnum(TrapType)
trapType?: TrapType;

// DEF não existe para Link
@ValidateIf(o => o.type === CardType.MONSTER && o.monsterType !== MonsterType.LINK)
@IsInt()
def?: number;

// Level só para não-Link e não-Xyz
@ValidateIf(o => o.type === CardType.MONSTER && o.monsterType !== MonsterType.LINK && o.monsterType !== MonsterType.XYZ)
@IsInt()
@Min(1)
@Max(12)
level?: number;
```

### **Frontend (conditional rendering)**

```tsx
{cardForm.type === 'Monster' && (
  <>
    <select name="monsterType" required>
      {/* 8 opções */}
    </select>
    
    {cardForm.monsterType === 'Link' ? (
      <input name="linkRating" min="1" max="8" />
    ) : cardForm.monsterType === 'Xyz' ? (
      <input name="rank" min="1" max="12" />
    ) : (
      <input name="level" min="1" max="12" />
    )}
    
    {cardForm.monsterType !== 'Link' && (
      <input name="def" />
    )}
    
    {cardForm.monsterType === 'Pendulum' && (
      <>
        <input name="pendulumScale" max="13" />
        <input name="pendulumEffect" />
      </>
    )}
  </>
)}

{cardForm.type === 'Spell' && (
  <select name="spellType" required>
    {/* 6 opções */}
  </select>
)}

{cardForm.type === 'Trap' && (
  <select name="trapType" required>
    {/* 3 opções */}
  </select>
)}
```

---

## 🔐 Segurança

### **Apenas MASTER e ADMIN**

```typescript
// admin.guard.ts
@UseGuards(JwtAuthGuard, AdminGuard)
@Post('cards')
createCard(@Body() dto: CreateCardDto) {
  return this.cardsService.create(dto);
}
```

### **Proteção contra duplicatas**

```typescript
// Verificar se carta já existe
const existing = await this.cardsRepository.findOne({
  where: { name: cardData.name }
});

if (existing) {
  throw new BadRequestException('Carta com este nome já existe');
}
```

---

## 📊 Logs e Monitoramento

```typescript
// CardsService
console.log('📝 Criando carta:', cardData.name);
console.log('✅ Carta criada:', savedCard.id);

if (savedCard.isForSale) {
  console.log('🛒 Adicionando à loja...');
  await this.shopService.addCardToShop(savedCard);
  console.log('✅ Carta adicionada à loja');
}
```

---

## 🧪 Testes

### **Criar Monstro Normal**

```bash
curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dark Magician",
    "description": "The ultimate wizard",
    "type": "Monster",
    "monsterType": "Normal",
    "attribute": "DARK",
    "race": "Spellcaster",
    "level": 7,
    "atk": 2500,
    "def": 2100,
    "rarity": "Ultra Rare",
    "priceCoins": 10000,
    "isForSale": true
  }'
```

### **Criar Spell**

```bash
curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Raigeki",
    "description": "Destroy all monsters your opponent controls",
    "type": "Spell",
    "spellType": "Normal",
    "rarity": "Secret Rare",
    "priceCredits": 1000,
    "isForSale": true
  }'
```

### **Criar Trap**

```bash
curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mirror Force",
    "description": "Destroy all Attack Position monsters",
    "type": "Trap",
    "trapType": "Normal",
    "rarity": "Super Rare",
    "priceCash": 4.99,
    "isForSale": true
  }'
```

---

## 🎨 UI - Ícones e Cores

### **Atributos**
- ⚫ DARK
- ⚪ LIGHT
- 💧 WATER
- 🔥 FIRE
- 🌍 EARTH
- 🌪️ WIND
- ✨ DIVINE

### **Spell Types**
- 🟢 Normal
- ♾️ Continuous
- ⚔️ Equip
- 🏞️ Field
- ⚡ Quick-Play
- 🔮 Ritual

### **Trap Types**
- 🟢 Normal
- ♾️ Continuous
- 🛡️ Counter

### **Status**
- ⛔ Banida (vermelho)
- ⚠️ Limitada (amarelo)
- ✅ Disponível na Loja (verde)

---

## 📝 Notas Importantes

1. **Integração Automática**: Quando `isForSale = true`, a carta é automaticamente adicionada em `shop_items`

2. **Campos Condicionais**: Backend valida que campos obrigatórios estejam presentes baseado no tipo

3. **Preços Flexíveis**: Admin pode definir preços em moedas, créditos, dinheiro ou combinações

4. **Tipos Completos**: Suporte para todos os tipos de Yu-Gi-Oh (Normal, Effect, Ritual, Fusion, Synchro, Xyz, Pendulum, Link)

5. **25 Raças**: Todos os tipos de monstro do TCG incluídos

6. **Arquétipos**: Sistema para agrupar cartas do mesmo arquétipo

7. **Banlist**: Suporte para cartas banidas e limitadas

---

## 🚀 Próximos Passos

- [ ] Upload de imagens de cartas
- [ ] Sistema de efeitos visuais para tipos especiais
- [ ] Preview da carta antes de criar
- [ ] Importação em lote (CSV/JSON)
- [ ] Editor de efeitos complexos (JSONB)
- [ ] Histórico de preços
- [ ] Analytics de vendas por carta

---

## 📞 Suporte

Sistema desenvolvido e documentado completamente. ✅
