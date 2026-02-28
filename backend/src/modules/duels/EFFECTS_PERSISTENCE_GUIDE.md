# Guia de Persistência de Efeitos de Cartas

## Problema Identificado

Os efeitos de cartas e mecânicas criadas durante o duelo estavam se perdendo e parando de funcionar. Isso acontecia porque:

1. **Dessincronização entre Cache e Banco**: O código atualizava o cache (`activeDuels`) mas nem sempre salvava no banco de dados
2. **Sobrescrita de Dados Recentes**: Quando `findDuelByIdFromDatabase` era chamado com `forceFromDatabase: true`, ele buscava do banco e **sobrescrevia o cache**, mesmo que o cache tivesse dados mais recentes
3. **Múltiplas Fontes de Verdade**: Havia muitas chamadas `activeDuels.set()` espalhadas pelo código, sem garantia de sincronização

## Solução Implementada

### 1. Método Centralizado `syncDuelState`

Criado um método centralizado que **sempre sincroniza cache e banco**:

```typescript
async syncDuelState(duelId: string | number, duel: Duel, updates?: Partial<Duel>): Promise<void>
```

**Uso:**
```typescript
// ✅ CORRETO: Sempre usar syncDuelState para atualizar estado
await this.duelsService.syncDuelState(duelId, updatedDuel);

// ❌ ERRADO: Não usar activeDuels.set() diretamente
this.activeDuels.set(duelId, updatedDuel); // Pode perder dados!
```

### 2. Proteção no `findDuelByIdFromDatabase`

Adicionada verificação para **não sobrescrever cache com dados antigos**:

- Compara timestamps (`updatedAt`) entre cache e banco
- Se o cache for mais recente, **preserva o cache** e sincroniza com o banco em background
- Previne perda de efeitos que ainda não foram salvos no banco

### 3. Regras de Ouro

1. **Sempre use `syncDuelState`** quando atualizar o estado do duelo
2. **Nunca use `activeDuels.set()` diretamente** sem salvar no banco
3. **Sempre chame `updateDuelInDatabase`** após modificar o duelo
4. **Use `syncDuelState`** em efeitos de cartas para garantir persistência

## Migração de Código Existente

### Antes (❌ Problemático):
```typescript
// Atualiza cache mas pode perder dados
this.activeDuels.set(duelId, duel);
```

### Depois (✅ Correto):
```typescript
// Sincroniza cache E banco
await this.duelsService.syncDuelState(duelId, duel);
```

## Exemplo em Efeito de Carta

```typescript
async process(context: CardEffectContext): Promise<CardEffectResult> {
  // ... lógica do efeito ...
  
  // Atualizar campos do duelo
  const playerField = this.getPlayerField(context);
  playerField.hand.push(newCard);
  
  // ✅ CORRETO: Sincronizar estado
  await this.syncDuelState(context.duelId, context.duel);
  
  return { success: true, createdPendingChoice: false };
}
```

## Verificação de Problemas

Se efeitos ainda estão se perdendo, verifique:

1. **Logs**: Procure por `⚠️ [findDuelByIdFromDatabase] Cache tem dados mais recentes` - indica que cache não foi salvo no banco
2. **Chamadas diretas**: Procure por `activeDuels.set(` no código - devem ser substituídas por `syncDuelState`
3. **Timing**: Efeitos que modificam o duelo mas não chamam `syncDuelState` ou `updateDuelInDatabase`

## Próximos Passos

1. Migrar todas as chamadas `activeDuels.set()` para `syncDuelState`
2. Adicionar testes para garantir sincronização
3. Monitorar logs para identificar padrões de perda de dados


