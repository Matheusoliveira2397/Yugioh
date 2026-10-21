# Sistema de Efeitos de Cartas

## Estrutura de pastas

```
card-effects/effects/
├── spells/      # Magias (classes, simple-effects, player-target helpers)
├── traps/       # Armadilhas (Drop Off + ativações automáticas)
└── Monsters/    # Monstros (um arquivo por carta)
```

Novos efeitos: arquivo em `effects/spells|traps|Monsters/`, registrar no `card-effects.module.ts` e listar em `catalog/all-effects.catalog.ts`.

## Anti-regressão (efeito não pode “sumir” depois)

1. **Um arquivo por carta** — nunca edite o efeito A para “consertar” o B.
2. **Match exato** — registry não usa `includes`; colisão de chave lança erro no boot.
3. **Sem fallback se o efeito registrado falhar** — erro fica visível; não mascara com código antigo.
4. **Selo (`validation/effects-seal.json`)** — no boot, se um efeito que já existia sumir do registry, o log marca `REGRESSÃO`.
5. **Persistência** — em efeitos, use `updateDuel` / `syncDuelState`, nunca só `activeDuels.set`.

## Arquitetura Flexível

Este sistema oferece **duas opções** para criar efeitos:

### 1. **Função Simples** (Recomendado para efeitos básicos)
Para efeitos simples que não precisam de lógica complexa, apenas uma função é suficiente!

```typescript
// effects/simple-effects.ts
export const createPotOfGreedEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
    
    // Comprar 2 cartas
    await duelsService.drawCard(duelId, userId);
    await duelsService.drawCard(duelId, userId);
    
    // Mover para o cemitério
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await duelsService.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    
    return {
      success: true,
      createdPendingChoice: false,
      message: 'Pot of Greed: Jogador comprou 2 cartas',
    };
  };
};
```

**Registrar no módulo:**
```typescript
this.registry.registerSimple(
  ['pot of greed'],
  createPotOfGreedEffect(this.duelsService),
  ['PotOfGreed'],
  this.duelsService,
);
```

### 2. **Classe Completa** (Para efeitos complexos)
Para efeitos que precisam de validações complexas, múltiplos métodos, ou lógica avançada:

```typescript
// effects/mystical-space-typhoon.effect.ts
@Injectable()
export class MysticalSpaceTyphoonEffect extends BaseCardEffect {
  readonly cardNames = ['mystical space typhoon'];
  readonly cardIds = ['MysticalSpaceTyphoon'];

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    // Lógica complexa aqui
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}
```

## Quando Usar Cada Abordagem?

### Use Função Simples quando:
- ✅ Efeito é direto (compra carta, causa dano, etc.)
- ✅ Não precisa de validações complexas
- ✅ Não precisa de múltiplos métodos
- ✅ Lógica cabe em uma função

**Exemplos:** Pot of Greed, Upstart Goblin, Hinotama, Raigeki, Dark Hole

### Use Classe Completa quando:
- ✅ Efeito precisa de escolha do jogador
- ✅ Precisa de validações complexas
- ✅ Tem múltiplos métodos auxiliares
- ✅ Lógica é muito complexa

**Exemplos:** Mystical Space Typhoon, Change of Heart, Monster Reborn, Graceful Charity

## Como Adicionar um Novo Efeito Simples

### Passo 1: Criar a função em `simple-effects.ts`

```typescript
export const createNomeDaCartaEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    
    // Sua lógica aqui
    
    return {
      success: true,
      createdPendingChoice: false,
      message: 'Efeito processado',
    };
  };
};
```

### Passo 2: Registrar no módulo

```typescript
this.registry.registerSimple(
  ['nome da carta'],
  createNomeDaCartaEffect(this.duelsService),
  ['NomeDaCarta'],
  this.duelsService,
);
```

**Pronto!** É só isso - não precisa criar classe, não precisa de providers, é super simples!

## Vantagens desta Abordagem

### Funções Simples:
- ✅ **Muito mais fácil** de criar
- ✅ **Menos código** (10-30 linhas vs 100+ linhas)
- ✅ **Mais rápido** de implementar
- ✅ **Fácil de entender**

### Classes Completas:
- ✅ **Mais organizado** para lógica complexa
- ✅ **Reutilização** de métodos auxiliares
- ✅ **Melhor para testes** unitários
- ✅ **Mais profissional** para efeitos grandes

## Exemplos Práticos

### Exemplo 1: Efeito Simples (Raigeki)
```typescript
export const createRaigekiEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    // Destruir todos os monstros do oponente
    if (opponentField?.monsters) {
      for (let i = 0; i < opponentField.monsters.length; i++) {
        if (opponentField.monsters[i]) {
          if (!opponentField.graveyard) opponentField.graveyard = [];
          opponentField.graveyard.push(opponentField.monsters[i]);
          opponentField.monsters[i] = null;
        }
      }
    }
    
    // Mover Raigeki para o cemitério
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await duelsService.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    
    return { success: true, message: 'Raigeki destruiu todos os monstros do oponente' };
  };
};
```

**Registrar:**
```typescript
this.registry.registerSimple(['raigeki'], createRaigekiEffect(this.duelsService), ['Raigeki'], this.duelsService);
```

## Resumo

- **Efeitos simples** → Use função em `simple-effects.ts` (mais fácil!)
- **Efeitos complexos** → Use classe em `effects/nome.effect.ts` (mais organizado)
- **Ambos funcionam** → O sistema detecta automaticamente
- **Isolamento garantido** → Cada efeito não interfere com outros
