# 🎴 Sistema Híbrido de Cadastro de Cartas

## 🎯 Problema Identificado

Muitas cartas Yu-Gi-Oh têm efeitos únicos e complexos que não podem ser padronizados em templates.

Exemplos:
- **"Obelisco, o Atormentador"**: Efeito único de tributar 2 monstros para destruir todos os monstros do oponente
- **"Exodia, o Proibido"**: Vitória automática se tiver as 5 peças
- **"Dragão Arco-Íris"**: Pode usar 7 Cristais para ganhar imunidade total

---

## ✨ SOLUÇÃO: Sistema Híbrido

### **3 Modos de Cadastro:**

1. **📝 Texto Livre** - Para efeitos únicos
2. **🎯 Templates** - Para efeitos comuns
3. **🔧 Custom Code** - Para efeitos complexos programados

---

## 📋 MODO 1: TEXTO LIVRE (Padrão)

### Uso:
Cartas com efeitos únicos ou narrativos.

### Exemplo:

```json
{
  "name": "Dragão Branco de Olhos Azuis",
  "description": "Este lendário dragão é uma poderosa máquina de destruição. Virtualmente invencível, muito poucos enfrentaram esta magnífica criatura e viveram para contar a história.",
  "cardImage": "blue-eyes-white-dragon.jpg",
  "type": "Monster",
  "monsterType": "Normal",
  "attribute": "LIGHT",
  "race": "Dragon",
  "level": 8,
  "atk": 3000,
  "def": 2500,
  "rarity": "Ultra Rare",
  
  // EFEITO TEXTO LIVRE
  "effectType": "text-only",
  "effectDescription": null // Monstro Normal não tem efeito
}
```

### Outro Exemplo (com efeito único):

```json
{
  "name": "Exodia, o Proibido",
  "effectType": "text-only",
  "effectDescription": "Se você tiver 'Perna Direita do Proibido', 'Perna Esquerda do Proibido', 'Braço Direito do Proibido' e 'Braço Esquerdo do Proibido' além desta carta em sua mão, você vence o Duelo.",
  "isExecutable": false // Não executa automaticamente no jogo
}
```

---

## 🎯 MODO 2: TEMPLATES RÁPIDOS (Opcional)

### Uso:
Para acelerar cadastro de cartas com efeitos comuns.

### Biblioteca de Atalhos:

```typescript
// Templates simples para efeitos comuns
export const QUICK_TEMPLATES = {
  'destroy-1-monster': 'Destrua 1 monstro que seu oponente controla.',
  'draw-2-cards': 'Compre 2 cartas.',
  'discard-1-random': 'Seu oponente descarta 1 carta aleatória.',
  'gain-1000-lp': 'Ganhe 1000 Life Points.',
  'special-summon-graveyard': 'Invoque Especialmente 1 monstro do seu Cemitério.',
  'negate-activation': 'Negue a ativação daquele card e destrua-o.',
  'boost-atk-500': 'Aumente o ATK do monstro alvo em 500.',
  'cannot-be-destroyed': 'Este card não pode ser destruído por efeitos de card.',
};
```

### No Admin Panel:

```
┌────────────────────────────────────────┐
│ Descrição do Efeito:                   │
│ ┌────────────────────────────────────┐ │
│ │ [Digite ou cole o efeito aqui...] │ │
│ │                                    │ │
│ │                                    │ │
│ └────────────────────────────────────┘ │
│                                        │
│ 🚀 Atalhos Rápidos (opcional):        │
│ [Destruir 1 Monstro]                  │
│ [Comprar 2 Cartas]                    │
│ [Descartar 1 Aleatória]               │
│ [Invocar do Cemitério]                │
│ [+ Ver mais...]                       │
└────────────────────────────────────────┘
```

---

## 🔧 MODO 3: CÓDIGO EXECUTÁVEL (Avançado)

### Uso:
Para cartas que precisam funcionar no sistema de duelos.

### Estrutura:

```typescript
// Card Entity
@Column({ type: 'text', nullable: true })
effectDescription: string; // Texto descritivo

@Column({ type: 'jsonb', nullable: true })
effectCode?: {
  // Tipo de efeito programático
  type: 'trigger' | 'continuous' | 'ignition' | 'quick' | 'flip';
  
  // Quando ativa
  timing: string[]; // ['summon', 'battle', 'end-phase']
  
  // Função executável (nome da função no backend)
  executor: string; // 'destroyMonster', 'drawCards', 'exodiaWin'
  
  // Parâmetros
  params: any;
  
  // Condições
  conditions?: {
    field: string;
    operator: string;
    value: any;
  }[];
  
  // Custo
  cost?: {
    type: string;
    value: any;
  };
};
```

### Exemplo Real:

```json
{
  "name": "Magia de Truque",
  "effectDescription": "Quando esta carta for ativada: Compre 2 cartas, depois descarte 1 carta.",
  "effectType": "executable",
  "effectCode": {
    "type": "trigger",
    "timing": ["activation"],
    "executor": "upstartGoblinEffect",
    "params": {
      "actions": [
        { "type": "draw", "count": 2 },
        { "type": "discard", "count": 1, "selection": "player-choice" }
      ]
    }
  }
}
```

---

## 🎨 INTERFACE DO ADMIN PANEL

### Formulário Simplificado:

```tsx
function CardForm() {
  return (
    <form>
      {/* SEÇÃO 1: Informações Básicas */}
      <Section title="📋 Informações Básicas">
        <Input name="name" label="Nome da Carta" required />
        <Input name="nameEn" label="Nome (Inglês)" />
        <TextArea name="description" label="Descrição/Lore" rows={3} />
        <ImageUpload name="cardImage" label="Imagem da Carta" />
      </Section>

      {/* SEÇÃO 2: Tipo e Stats */}
      <Section title="📊 Tipo e Atributos">
        <Select name="type" label="Tipo" options={['Monster', 'Spell', 'Trap']} />
        
        {/* Se for Monstro */}
        {type === 'Monster' && (
          <>
            <Select name="monsterType" label="Tipo de Monstro" />
            <Select name="attribute" label="Atributo" />
            <Input name="race" label="Raça" />
            <Input name="level" label="Nível" type="number" />
            <Input name="atk" label="ATK" type="number" />
            <Input name="def" label="DEF" type="number" />
          </>
        )}
      </Section>

      {/* SEÇÃO 3: EFEITO (TEXTO LIVRE) */}
      <Section title="✨ Efeito da Carta">
        <TextArea 
          name="effectDescription" 
          label="Descrição do Efeito"
          placeholder="Digite o efeito da carta aqui... (pode ser copiado do site oficial)"
          rows={5}
        />
        
        {/* Atalhos Opcionais */}
        <div className="mt-2">
          <p className="text-sm text-gray-500 mb-2">
            🚀 Atalhos rápidos (clique para inserir):
          </p>
          <div className="flex flex-wrap gap-2">
            <QuickButton onClick={() => insertText('Destrua 1 monstro...')}>
              🎯 Destruir Monstro
            </QuickButton>
            <QuickButton onClick={() => insertText('Compre 2 cartas.')}>
              📈 Comprar Cartas
            </QuickButton>
            <QuickButton onClick={() => insertText('Invoque Especialmente...')}>
              ✨ Invocação Especial
            </QuickButton>
            {/* ... mais atalhos */}
          </div>
        </div>

        {/* Switch para habilitar execução automática (futuro) */}
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <label className="flex items-center">
            <input 
              type="checkbox" 
              name="isExecutable"
              className="mr-2"
            />
            <span className="text-sm">
              🔧 Esta carta terá efeito executável no jogo
              <span className="text-gray-500 ml-2">
                (requer programação adicional)
              </span>
            </span>
          </label>
        </div>
      </Section>

      {/* SEÇÃO 4: Loja */}
      <Section title="💰 Configurações da Loja">
        <Select 
          name="rarity" 
          label="Raridade" 
          options={['Common', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare', 'Legendary']}
        />
        
        <div className="p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            💰 Preço Automático: <strong>{calculatePrice()} moedas</strong>
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Baseado na raridade selecionada
          </p>
        </div>

        <label className="flex items-center mt-4">
          <input type="checkbox" name="isLimited" className="mr-2" />
          <span>Esta carta é limitada/banida</span>
        </label>

        <Input 
          name="maxCopiesInDeck" 
          label="Máximo de Cópias no Deck" 
          type="number" 
          min="0" 
          max="3" 
          defaultValue="3"
        />
      </Section>

      {/* Botões */}
      <div className="flex gap-4 mt-6">
        <Button type="submit" variant="primary">
          💾 Salvar Carta
        </Button>
        <Button type="button" variant="secondary">
          👁️ Preview
        </Button>
        <Button type="button" variant="ghost">
          ❌ Cancelar
        </Button>
      </div>
    </form>
  );
}
```

---

## 💾 ESTRUTURA NO BANCO DE DADOS

### Card Entity (Simplificada):

```typescript
@Entity('cards')
export class Card {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ℹ️ BÁSICO
  @Column()
  name: string;

  @Column({ nullable: true })
  nameEn?: string;

  @Column('text')
  description: string;

  @Column()
  cardImage: string;

  // 📊 TIPO
  @Column({
    type: 'enum',
    enum: CardType,
  })
  type: CardType;

  @Column({
    type: 'enum',
    enum: MonsterType,
    nullable: true,
  })
  monsterType?: MonsterType;

  @Column({
    type: 'enum',
    enum: CardAttribute,
    nullable: true,
  })
  attribute?: CardAttribute;

  @Column({ nullable: true })
  race?: string;

  // 💪 STATS
  @Column({ nullable: true })
  level?: number;

  @Column({ nullable: true })
  atk?: number;

  @Column({ nullable: true })
  def?: number;

  // ✨ EFEITO (TEXTO LIVRE - SEMPRE PRESENTE)
  @Column('text', { nullable: true })
  effectDescription?: string;

  // 🔧 CÓDIGO EXECUTÁVEL (OPCIONAL - PARA FUTURO)
  @Column('jsonb', { nullable: true })
  effectCode?: {
    type: string;
    timing: string[];
    executor: string;
    params: any;
    conditions?: any[];
    cost?: any;
  };

  @Column({ default: false })
  isExecutable: boolean; // Se true, o jogo tenta executar effectCode

  // 🌟 RARIDADE
  @Column({
    type: 'enum',
    enum: CardRarity,
  })
  rarity: CardRarity;

  // ⚙️ CONFIGURAÇÕES
  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isLimited: boolean;

  @Column({ default: 3 })
  maxCopiesInDeck: number;

  @Column({ nullable: true })
  konamiId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // 🔗 RELAÇÕES
  @OneToMany(() => ShopItem, (shopItem) => shopItem.card)
  shopItems: ShopItem[];
}
```

---

## 🚀 FLUXO DE CADASTRO

### Passo a Passo:

1. **Admin acessa painel** → "Cadastrar Nova Carta"

2. **Preenche formulário:**
   - Nome, descrição, imagem ✅
   - Tipo, stats ✅
   - **Efeito em TEXTO LIVRE** ✅ (pode copiar do site oficial)
   - Raridade ✅

3. **Sistema salva:**
   ```typescript
   // No backend
   async create(createCardDto: CreateCardDto) {
     const card = this.cardsRepository.create({
       ...createCardDto,
       isExecutable: false, // Por padrão, apenas texto
     });
     
     await this.cardsRepository.save(card);
     
     // Auto-adicionar à loja
     await this.shopService.addCardToShop(card);
     
     return card;
   }
   ```

4. **Carta aparece:**
   - ✅ Na loja com preço automático
   - ✅ Disponível para coleta
   - ✅ Visível no inventário

5. **No futuro (opcional):**
   - Programar efeitos específicos
   - Ativar `isExecutable: true`
   - Testar no sistema de duelos

---

## 🎯 EXEMPLOS PRÁTICOS

### Exemplo 1: Monstro Normal (Simples)

```json
{
  "name": "Dragão Branco de Olhos Azuis",
  "description": "Este lendário dragão é uma poderosa máquina de destruição.",
  "type": "Monster",
  "monsterType": "Normal",
  "level": 8,
  "atk": 3000,
  "def": 2500,
  "effectDescription": null,
  "rarity": "Ultra Rare"
}
```
**Tempo de cadastro: 1 minuto** ⚡

### Exemplo 2: Carta com Efeito Único

```json
{
  "name": "Relinquished",
  "description": "Um demônio ritual que absorve poder.",
  "type": "Monster",
  "monsterType": "Ritual",
  "level": 1,
  "atk": 0,
  "def": 0,
  "effectDescription": "Uma vez por turno: Você pode equipar 1 monstro que seu oponente controla a esta carta (máx. 1). O ATK e DEF desta carta se tornam o ATK e DEF originais daquele monstro. Se esta carta seria destruída em batalha, destrua aquele monstro equipado ao invés.",
  "rarity": "Secret Rare"
}
```
**Tempo de cadastro: 2 minutos** ⚡ (só copiar e colar o efeito)

### Exemplo 3: Magia Simples

```json
{
  "name": "Pote da Ganância",
  "description": "Um pote mágico que concede sorte.",
  "type": "Spell",
  "effectDescription": "Compre 2 cartas.",
  "rarity": "Rare"
}
```
**Tempo de cadastro: 30 segundos** ⚡

---

## ✅ VANTAGENS DESTA ABORDAGEM

### Para o Admin:
✅ **Super Rápido** - Cadastrar cartas em segundos
✅ **Flexível** - Qualquer efeito pode ser escrito
✅ **Sem Limitações** - Cartas únicas não são problema
✅ **Copy/Paste** - Pode copiar efeitos de sites oficiais
✅ **Atalhos** - Templates para acelerar cartas comuns

### Para o Sistema:
✅ **Simples** - Apenas texto no banco de dados
✅ **Escalável** - Adicionar código executável depois (opcional)
✅ **Flexível** - Não depende de templates rígidos
✅ **Gradual** - Implementar efeitos jogáveis aos poucos

### Para os Jogadores:
✅ **Cartas Disponíveis** - Grande variedade desde o início
✅ **Fiel ao Original** - Efeitos escritos como no TCG oficial
✅ **Colecionável** - Pode colecionar mesmo sem duelos funcionais
✅ **Futuro** - Efeitos serão implementados gradualmente

---

## 🎮 ROADMAP DE IMPLEMENTAÇÃO

### Fase 1: TEXTO LIVRE (Agora) ✅
- Cadastro rápido com texto livre
- Upload de imagens
- Preço automático por raridade
- Loja funcionando
- **Resultado: 100+ cartas cadastradas rapidamente**

### Fase 2: COLECIONÁVEIS (Futuro)
- Sistema de pacotes/boosters
- Inventário de cartas
- Trading entre jogadores
- **Resultado: Jogo colecionável funcional**

### Fase 3: DUELOS BÁSICOS (Futuro)
- Invocações manuais
- Batalhas simples (ATK vs DEF)
- Monstros normais jogáveis
- **Resultado: Duelos básicos funcionando**

### Fase 4: EFEITOS SIMPLES (Futuro)
- Implementar efeitos comuns
- "Destruir 1 monstro", "Comprar cartas", etc.
- Marcar cartas com `isExecutable: true`
- **Resultado: Cartas com efeitos básicos funcionais**

### Fase 5: EFEITOS COMPLEXOS (Futuro)
- Cartas icônicas (Exodia, Obelisk, etc.)
- Efeitos únicos programados individualmente
- **Resultado: Jogo completo e funcional**

---

## 🔥 IMPLEMENTAÇÃO IMEDIATA

Quer que eu implemente a **Fase 1** agora?

### O que vou criar:

1. **Backend:**
   - ✅ Atualizar Card Entity (simplificar para texto livre)
   - ✅ Endpoint de upload de imagem
   - ✅ CRUD de cartas simplificado
   - ✅ Auto-adicionar à loja

2. **Frontend:**
   - ✅ Página "Admin - Cadastrar Carta"
   - ✅ Formulário simples e rápido
   - ✅ Upload de imagem com preview
   - ✅ TextArea livre para efeitos
   - ✅ Atalhos rápidos (opcional)
   - ✅ Preview da carta

### Resultado:
**Em 30 minutos você pode cadastrar 50+ cartas!** 🚀

Vamos implementar? 🎴
