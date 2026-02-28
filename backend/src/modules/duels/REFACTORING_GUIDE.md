# Guia de Refatoração - Sistema de Duelos

## Visão Geral

O sistema de duelos foi refatorado para ser **modular, escalável e à prova de quebras**. A estrutura agora permite adicionar novas funcionalidades sem modificar código existente.

## Estrutura Criada

### Serviços de Batalha (`services/battle/`)
- **BattleService**: Orquestra o fluxo de batalha
- **TrapService**: Gerencia todas as traps
- **DamageCalculationService**: Calcula dano
- **GraveyardService**: Gerencia cemitério
- **EquipmentService**: Gerencia equipamentos
- **AttackValidationService**: Valida ataques
- **MonsterBattleService**: Lógica de batalha entre monstros
- **FieldStateService**: Estado do campo

### Serviços de Cartas
- **SpellService**: Lógica de spells
- **MonsterService**: Lógica de monstros
- **SummonService**: Invocações

### Serviços Existentes
- **CardEffectsService**: Efeitos de cartas
- **CardEffectHandlersService**: Handlers de escolhas
- **DuelUtilsService**: Utilitários
- **FieldActionsService**: Ações no campo
- **TurnPhaseService**: Fases do turno

### Constantes
- **duel.constants.ts**: Valores centralizados (limites, IDs, etc)

## Como Usar os Novos Serviços

### Exemplo 1: Adicionar Nova Trap

**Antes (no DuelsService):**
```typescript
async checkAndActivateNovaTrap(...) {
  // 500 linhas de código misturado
}
```

**Depois (no TrapService):**
```typescript
// 1. Adicionar método no TrapService
async checkAndActivateNovaTrap(
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean
): Promise<boolean> {
  // Lógica isolada e testável
}

// 2. Usar no BattleService
const activated = await this.trapService.checkAndActivateNovaTrap(...);
```

**Benefícios:**
- ✅ Código isolado e testável
- ✅ Não afeta outras traps
- ✅ Fácil de encontrar e manter

### Exemplo 2: Adicionar Novo Tipo de Dano

**Antes:**
```typescript
// Código espalhado no DuelsService
```

**Depois:**
```typescript
// 1. Adicionar método no DamageCalculationService
calculateNovoTipoDano(...): number {
  // Lógica isolada
}

// 2. Usar onde necessário
const dano = this.damageCalculation.calculateNovoTipoDano(...);
```

### Exemplo 3: Adicionar Nova Validação de Ataque

**Antes:**
```typescript
// Validações misturadas no método attackMonster
```

**Depois:**
```typescript
// 1. Adicionar método no AttackValidationService
validateNovaCondicao(...): { valid: boolean; message?: string } {
  // Validação isolada
}

// 2. Usar no fluxo de validação
const validation = this.attackValidation.validateNovaCondicao(...);
if (!validation.valid) {
  return { success: false, message: validation.message };
}
```

## Migração Gradual

A migração está sendo feita **gradualmente** para garantir zero downtime:

1. ✅ **Estrutura criada**: Todos os serviços foram criados
2. ⏳ **Migração de código**: Código sendo migrado do `DuelsService` para serviços específicos
3. ⏳ **Atualização de dependências**: Outros serviços sendo atualizados para usar os novos
4. ⏳ **Testes**: Testes unitários para cada serviço
5. ⏳ **Limpeza**: Remover código duplicado do `DuelsService`

### Status Atual

- ✅ Estrutura modular criada
- ✅ Serviços registrados no módulo
- ✅ Interfaces e tipos definidos
- ✅ Documentação criada
- ⏳ Migração de código em andamento (delegação temporária)

## Princípios Seguidos

### 1. Single Responsibility
Cada serviço tem uma única responsabilidade clara.

### 2. Dependency Injection
Todos os serviços usam DI do NestJS, facilitando testes.

### 3. Open/Closed Principle
Aberto para extensão, fechado para modificação.

### 4. Interface Segregation
Interfaces específicas para cada tipo de operação.

### 5. Don't Repeat Yourself (DRY)
Código comum centralizado em serviços utilitários.

## Como Adicionar Nova Funcionalidade

### Passo 1: Identificar Responsabilidade
- É relacionado a batalha? → `services/battle/`
- É relacionado a spells? → `services/spell/`
- É relacionado a monstros? → `services/monster/`
- É utilitário? → `services/duel-utils.service.ts`

### Passo 2: Escolher ou Criar Serviço
- Se já existe serviço relacionado, adicionar método lá
- Se não existe, criar novo serviço seguindo o padrão

### Passo 3: Implementar
- Criar método com tipagem forte
- Usar interfaces quando necessário
- Adicionar logs para debugging
- Retornar objetos com `success` e `message` quando aplicável

### Passo 4: Registrar no Módulo
- Adicionar no `providers` do `duels.module.ts`
- Adicionar no `exports` se necessário

### Passo 5: Usar
- Injetar serviço onde necessário
- Chamar método
- Não precisa modificar código existente!

## Exemplo Completo: Adicionar Nova Trap

```typescript
// 1. TrapService (services/battle/trap.service.ts)
async checkAndActivateNovaTrap(
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean
): Promise<boolean> {
  const defenderField = isPlayer1 
    ? (duel as any).player2Field 
    : (duel as any).player1Field;
  
  if (!defenderField?.spellTrap) return false;
  
  // Lógica da trap
  const trapIndex = defenderField.spellTrap.findIndex(
    (st: any) => st && this.duelUtils.isExactCard(st, 'NovaTrap')
  );
  
  if (trapIndex === -1) return false;
  
  // Ativar trap
  // ...
  
  return true;
}

// 2. BattleService (services/battle/battle.service.ts)
async attackMonster(...) {
  // ...
  const novaTrapActivated = await this.trapService.checkAndActivateNovaTrap(...);
  if (novaTrapActivated) {
    // Processar efeito
  }
  // ...
}

// 3. Pronto! Não precisa modificar código existente
```

## Benefícios da Refatoração

1. **Escalabilidade**: Fácil adicionar novas funcionalidades
2. **Manutenibilidade**: Código organizado e fácil de entender
3. **Testabilidade**: Serviços pequenos são fáceis de testar
4. **Colaboração**: Múltiplos desenvolvedores podem trabalhar sem conflitos
5. **Performance**: IDEs funcionam melhor com arquivos menores
6. **Reutilização**: Serviços podem ser reutilizados

## Próximos Passos

1. Migrar lógica de traps do `DuelsService` para `TrapService`
2. Migrar cálculo de dano para `DamageCalculationService`
3. Migrar lógica de batalha para `MonsterBattleService`
4. Adicionar testes unitários
5. Documentar APIs públicas

## Dúvidas?

Consulte:
- `ARCHITECTURE.md` - Arquitetura detalhada
- `services/battle/README.md` - Documentação dos serviços de batalha
- `duel.constants.ts` - Constantes centralizadas

