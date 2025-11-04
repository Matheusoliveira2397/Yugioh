# 🎴 Sistema de Cadastro de Cartas - Yu-Gi-Oh! Game

## 📌 Visão Geral

O sistema utiliza uma arquitetura de **Efeitos Reutilizáveis** baseada em componentes, permitindo criar cartas complexas sem duplicação de código.

---

## 🏗️ Arquitetura em 3 Camadas

### **1. Card Effects Library (Biblioteca de Efeitos)**
Uma biblioteca de efeitos pré-programados e testados que podem ser reutilizados.

### **2. Card Entity (Entidade da Carta)**
A carta em si, que referencia os efeitos da biblioteca.

### **3. Shop Integration (Integração com Loja)**
Preços automáticos baseados em raridade + efeitos.

---

## 🔧 1. BIBLIOTECA DE EFEITOS REUTILIZÁVEIS

### Localização:
`backend/src/modules/cards/effects/`

### Estrutura:

```typescript
// card-effects.registry.ts
export const CARD_EFFECTS = {
  // 🎯 EFEITOS DE DESCARTE
  'discard-opponent-1': {
    id: 'discard-opponent-1',
    name: 'Descartar 1 Carta do Oponente',
    description: 'O oponente descarta 1 carta da mão',
    category: 'discard',
    type: 'trigger',
    timing: ['summon', 'activation'],
    cost: null,
    target: { player: 'opponent', zone: 'hand', count: 1, selection: 'random' },
    action: 'discard',
    power: 3, // Usado para cálculo de preço
  },

  'discard-opponent-2': {
    id: 'discard-opponent-2',
    name: 'Descartar 2 Cartas do Oponente',
    description: 'O oponente descarta 2 cartas da mão',
    category: 'discard',
    type: 'ignition',
    timing: ['main-phase'],
    cost: { discard: 1 }, // Custo: descartar 1 carta sua
    target: { player: 'opponent', zone: 'hand', count: 2, selection: 'opponent-choice' },
    action: 'discard',
    power: 5,
  },

  // 🔥 EFEITOS DE DESTRUIÇÃO
  'destroy-monster-1': {
    id: 'destroy-monster-1',
    name: 'Destruir 1 Monstro',
    description: 'Destrua 1 monstro no campo',
    category: 'destruction',
    type: 'quick',
    timing: ['any'],
    cost: { lifePoints: 1000 },
    target: { zone: 'monster', count: 1, selection: 'player-choice' },
    action: 'destroy',
    power: 4,
  },

  // ✨ EFEITOS DE INVOCAÇÃO
  'special-summon-1': {
    id: 'special-summon-1',
    name: 'Invocação Especial do Cemitério',
    description: 'Invoque especialmente 1 monstro do seu cemitério',
    category: 'summon',
    type: 'ignition',
    timing: ['main-phase'],
    cost: null,
    target: { player: 'self', zone: 'graveyard', count: 1, filter: { type: 'monster' } },
    action: 'special-summon',
    power: 6,
  },

  // 📈 EFEITOS DE BOOST
  'atk-boost-500': {
    id: 'atk-boost-500',
    name: 'Aumentar ATK em 500',
    description: 'Aumente o ATK de 1 monstro em 500',
    category: 'boost',
    type: 'quick',
    timing: ['battle'],
    cost: null,
    target: { zone: 'monster', count: 1, selection: 'player-choice' },
    action: 'boost-atk',
    params: { amount: 500, duration: 'turn' },
    power: 2,
  },

  // 🎲 EFEITOS DE DRAW
  'draw-2': {
    id: 'draw-2',
    name: 'Comprar 2 Cartas',
    description: 'Você compra 2 cartas',
    category: 'draw',
    type: 'trigger',
    timing: ['activation'],
    cost: null,
    target: { player: 'self' },
    action: 'draw',
    params: { count: 2 },
    power: 4,
  },

  // 🛡️ EFEITOS DE PROTEÇÃO
  'protect-destruction': {
    id: 'protect-destruction',
    name: 'Proteção contra Destruição',
    description: 'Este card não pode ser destruído por efeitos de card',
    category: 'protection',
    type: 'continuous',
    timing: ['always'],
    cost: null,
    target: { zone: 'self' },
    action: 'protect',
    params: { type: 'destruction', source: 'effect' },
    power: 3,
  },

  // 🔄 EFEITOS DE RECUPERAÇÃO
  'return-hand': {
    id: 'return-hand',
    name: 'Retornar para Mão',
    description: 'Retorne 1 carta do campo para a mão',
    category: 'bounce',
    type: 'quick',
    timing: ['any'],
    cost: null,
    target: { zone: 'monster-spell-trap', count: 1, selection: 'player-choice' },
    action: 'return-hand',
    power: 3,
  },

  // 💰 EFEITOS DE LIFE POINTS
  'gain-lp-1000': {
    id: 'gain-lp-1000',
    name: 'Ganhar 1000 LP',
    description: 'Você ganha 1000 Life Points',
    category: 'life-points',
    type: 'trigger',
    timing: ['activation'],
    cost: null,
    target: { player: 'self' },
    action: 'gain-lp',
    params: { amount: 1000 },
    power: 2,
  },

  // 🔍 EFEITOS DE BUSCA
  'search-deck': {
    id: 'search-deck',
    name: 'Buscar no Deck',
    description: 'Adicione 1 carta do seu deck para sua mão',
    category: 'search',
    type: 'ignition',
    timing: ['main-phase'],
    cost: null,
    target: { zone: 'deck', count: 1, filter: { attribute: 'any' } },
    action: 'search',
    power: 5,
  },

  // 🎭 EFEITOS CONDICIONAIS
  'effect-if-3-monsters': {
    id: 'effect-if-3-monsters',
    name: 'Efeito com Condição de 3 Monstros',
    description: 'Se você controlar 3 ou mais monstros',
    category: 'conditional',
    type: 'trigger',
    timing: ['activation'],
    condition: { 
      type: 'field-count',
      zone: 'monster',
      player: 'self',
      operator: '>=',
      value: 3 
    },
    cost: null,
    target: null,
    action: 'custom',
    power: 4,
  },
};
```

---

## 📝 2. CADASTRO DE CARTAS

### Como Funciona:

#### **Opção A: Cadastro pelo Admin Panel (Frontend)**

```typescript
// Formulário no AdminPanel
interface CardForm {
  // ℹ️ INFORMAÇÕES BÁSICAS
  name: string;
  nameEn?: string;
  description: string;
  cardImage: File; // Upload de imagem
  
  // 📊 TIPO E ATRIBUTOS
  type: 'Monster' | 'Spell' | 'Trap';
  monsterType?: 'Normal' | 'Effect' | 'Fusion' | 'Xyz' | 'Synchro' | 'Link';
  attribute?: 'DARK' | 'LIGHT' | 'WATER' | 'FIRE' | 'EARTH' | 'WIND' | 'DIVINE';
  race?: string; // Dragon, Warrior, Spellcaster, etc.
  
  // 💪 STATS
  level?: number;
  atk?: number;
  def?: number;
  
  // ✨ EFEITOS (Múltiplos)
  effects: {
    effectId: string; // ID do efeito da biblioteca
    customDescription?: string; // Descrição personalizada
    customParams?: any; // Parâmetros customizados
  }[];
  
  // 🌟 RARIDADE
  rarity: 'Common' | 'Rare' | 'Super Rare' | 'Ultra Rare' | 'Secret Rare' | 'Legendary';
  
  // ⚙️ CONFIGURAÇÕES
  isLimited: boolean;
  maxCopiesInDeck: number; // 1, 2 ou 3
}
```

#### **Exemplo Prático - Cadastrando "Mago Negro":**

```json
{
  "name": "Mago Negro",
  "nameEn": "Dark Magician",
  "description": "O mago supremo em termos de ataque e defesa.",
  "cardImage": "dark-magician.jpg",
  "type": "Monster",
  "monsterType": "Normal",
  "attribute": "DARK",
  "race": "Spellcaster",
  "level": 7,
  "atk": 2500,
  "def": 2100,
  "effects": [],
  "rarity": "Ultra Rare",
  "isLimited": false,
  "maxCopiesInDeck": 3
}
```

#### **Exemplo - Carta com Efeito Reutilizável:**

```json
{
  "name": "Mão do Oponente",
  "nameEn": "Hand Control",
  "description": "Quando esta carta é ativada: o oponente descarta 1 carta aleatória.",
  "cardImage": "hand-control.jpg",
  "type": "Spell",
  "effects": [
    {
      "effectId": "discard-opponent-1",
      "customDescription": null
    }
  ],
  "rarity": "Rare",
  "maxCopiesInDeck": 2
}
```

#### **Exemplo - Carta com MÚLTIPLOS Efeitos:**

```json
{
  "name": "Dragão Branco de Olhos Azuis Alternativo",
  "nameEn": "Blue-Eyes Alternative White Dragon",
  "description": "Este card é sempre tratado como \"Dragão Branco de Olhos Azuis\".",
  "cardImage": "bewd-alternative.jpg",
  "type": "Monster",
  "monsterType": "Effect",
  "attribute": "LIGHT",
  "race": "Dragon",
  "level": 8,
  "atk": 3000,
  "def": 2500,
  "effects": [
    {
      "effectId": "destroy-monster-1",
      "customDescription": "Uma vez por turno: Você pode destruir 1 monstro que seu oponente controla."
    },
    {
      "effectId": "protect-destruction",
      "customDescription": "Este card não pode ser destruído por efeitos de card."
    }
  ],
  "rarity": "Secret Rare",
  "maxCopiesInDeck": 3
}
```

---

## 💰 3. SISTEMA DE PREÇOS AUTOMÁTICO

### Cálculo Baseado em:

1. **Raridade Base:**
   - Common: 100 moedas
   - Rare: 500 moedas
   - Super Rare: 1.500 moedas
   - Ultra Rare: 5.000 moedas
   - Secret Rare: 10.000 moedas
   - Legendary: 50.000 moedas

2. **Multiplicador de Efeitos:**
   ```
   Preço Final = Preço Base × (1 + (Soma dos Powers dos Efeitos × 0.1))
   ```

3. **Exemplo:**
   ```
   Carta: "Dragão Alternativo"
   Raridade: Secret Rare (10.000)
   Efeitos: 
     - destroy-monster-1 (power: 4)
     - protect-destruction (power: 3)
   
   Cálculo:
   10.000 × (1 + ((4 + 3) × 0.1))
   10.000 × 1.7
   = 17.000 moedas
   ```

---

## 🖼️ 4. UPLOAD DE IMAGENS

### Sistema de Upload:

```typescript
// backend/src/modules/upload/upload.service.ts

@Injectable()
export class UploadService {
  async uploadCardImage(file: Express.Multer.File): Promise<string> {
    // Validar imagem
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error('Tipo de arquivo inválido');
    }

    // Gerar nome único
    const fileName = `card-${Date.now()}-${file.originalname}`;
    
    // Salvar em /uploads/cards/
    const path = `uploads/cards/${fileName}`;
    await fs.promises.writeFile(path, file.buffer);
    
    // Retornar URL pública
    return `/uploads/cards/${fileName}`;
  }
}
```

### No Frontend (Admin Panel):

```tsx
// Componente de Upload
<input 
  type="file" 
  accept="image/*"
  onChange={(e) => {
    const file = e.target.files[0];
    // Preview da imagem
    setPreview(URL.createObjectURL(file));
    setCardImage(file);
  }}
/>
```

---

## 🔄 5. REUTILIZAÇÃO DE EFEITOS

### Vantagens:

✅ **Consistência**: Todos os efeitos de "descartar 1 carta" funcionam da mesma forma
✅ **Manutenção**: Corrigir um bug em um efeito corrige em todas as cartas
✅ **Performance**: Efeitos otimizados uma única vez
✅ **Expansibilidade**: Adicionar novos efeitos é fácil
✅ **Combinações**: Cartas podem ter múltiplos efeitos combinados

### Exemplo de Reutilização:

```typescript
// 5 cartas diferentes usando o mesmo efeito
const cards = [
  { name: 'Confisco', effects: ['discard-opponent-1'] },
  { name: 'Mão Escura', effects: ['discard-opponent-1'] },
  { name: 'Roubo Mental', effects: ['discard-opponent-1'] },
  { name: 'Confusão', effects: ['discard-opponent-1'] },
  { name: 'Caos Mental', effects: ['discard-opponent-1'] },
];

// Todas funcionam exatamente da mesma forma!
```

---

## 🎮 6. IMPLEMENTAÇÃO NO JOGO

### Durante um Duelo:

```typescript
// duel.service.ts
async activateCardEffect(cardId: string, duelId: string) {
  const card = await this.cardsService.findOne(cardId);
  
  // Buscar efeitos da biblioteca
  const effects = card.effects.map(e => CARD_EFFECTS[e.effectId]);
  
  // Aplicar cada efeito
  for (const effect of effects) {
    await this.executeEffect(effect, duelId);
  }
}

async executeEffect(effect: CardEffect, duelId: string) {
  switch (effect.action) {
    case 'discard':
      await this.handleDiscard(effect, duelId);
      break;
    case 'destroy':
      await this.handleDestroy(effect, duelId);
      break;
    case 'draw':
      await this.handleDraw(effect, duelId);
      break;
    // ... mais ações
  }
}
```

---

## 📊 7. PAINEL ADMIN - INTERFACE

### Tela de Cadastro:

```
┌──────────────────────────────────────────────┐
│  🎴 Cadastrar Nova Carta                     │
├──────────────────────────────────────────────┤
│                                              │
│  Nome: [__________________________________]  │
│  Nome (EN): [_____________________________]  │
│                                              │
│  Tipo: ( ) Monstro  ( ) Magia  ( ) Armadilha│
│                                              │
│  [Se Monstro]                                │
│  Tipo: [Effect ▼]                           │
│  Atributo: [DARK ▼]                         │
│  Raça: [Dragon ▼]                           │
│  Nível: [7]  ATK: [2500]  DEF: [2100]      │
│                                              │
│  Imagem: [📎 Upload]  [Preview]             │
│                                              │
│  Efeitos:                                    │
│  [+ Adicionar Efeito]                        │
│  ┌────────────────────────────────────────┐ │
│  │ 🎯 Efeito 1: [Descartar 1 Carta ▼]   │ │
│  │    Descrição Custom: [____________]    │ │
│  │    [🗑️ Remover]                       │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  Raridade: [Ultra Rare ▼]                   │
│  Limitada?: [✓] Sim  [ ] Não               │
│  Cópias no Deck: [3]                        │
│                                              │
│  💰 Preço Estimado: 17.000 moedas          │
│                                              │
│  [💾 Salvar]  [❌ Cancelar]                │
└──────────────────────────────────────────────┘
```

---

## ✨ RESUMO

### Como Cadastrar Cartas:

1. **Admin** acessa o painel
2. Clica em "Nova Carta"
3. Preenche informações básicas
4. Faz upload da imagem
5. **Seleciona efeitos da biblioteca** (múltiplos permitidos)
6. Sistema calcula preço automaticamente
7. Salva no banco de dados
8. Carta aparece automaticamente na loja!

### Efeitos Comuns Reutilizáveis:

✅ Descartar cartas (1, 2, 3...)
✅ Destruir monstros/magias/armadilhas
✅ Invocar do cemitério/deck/mão
✅ Aumentar/diminuir ATK/DEF
✅ Comprar cartas
✅ Ganhar/perder Life Points
✅ Proteção contra destruição
✅ Negação de efeitos
✅ Busca no deck
✅ E muito mais!

### Benefícios:

🎯 **Rápido**: Cadastrar cartas leva segundos
🔧 **Fácil**: Apenas selecionar efeitos prontos
💰 **Automático**: Preço calculado automaticamente
♻️ **Reutilizável**: Mesmos efeitos em múltiplas cartas
🐛 **Confiável**: Efeitos testados e otimizados
📈 **Escalável**: Adicionar novos efeitos é simples
