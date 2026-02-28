# Arquitetura dos Serviços de Duelo

## Visão Geral

O sistema de duelos foi refatorado para ser **modular, escalável e fácil de manter**. Cada serviço tem uma responsabilidade específica e bem definida, garantindo que adicionar novas funcionalidades não quebre código existente.

## Estrutura de Diretórios

```
services/
├── battle/                    # Serviços relacionados a batalha
│   ├── battle.service.ts     # Orquestração de batalha
│   ├── trap.service.ts        # Lógica de traps
│   ├── damage-calculation.service.ts  # Cálculo de dano
│   ├── graveyard.service.ts   # Gerenciamento de cemitério
│   ├── equipment.service.ts   # Lógica de equipamentos
│   ├── attack-validation.service.ts  # Validações de ataque
│   ├── monster-battle.service.ts     # Batalha entre monstros
│   ├── field-state.service.ts        # Estado do campo
│   ├── interfaces/            # Interfaces e tipos
│   └── index.ts              # Barrel exports
├── card-effects.service.ts   # Efeitos de cartas
├── card-effect-handlers.service.ts  # Handlers de escolhas
├── duel-utils.service.ts     # Utilitários
├── field-actions.service.ts  # Ações no campo
└── turn-phase.service.ts     # Fases do turno
```

## Princípios de Design

### 1. **Single Responsibility Principle (SRP)**
Cada serviço tem uma única responsabilidade:
- `BattleService`: Orquestra o fluxo de batalha
- `TrapService`: Gerencia todas as traps
- `DamageCalculationService`: Calcula dano
- `GraveyardService`: Gerencia cemitério
- etc.

### 2. **Dependency Injection**
Todos os serviços usam injeção de dependência do NestJS, facilitando testes e manutenção.

### 3. **Interface Segregation**
Interfaces específicas para cada tipo de operação, evitando dependências desnecessárias.

### 4. **Open/Closed Principle**
O código está aberto para extensão (adicionar novas traps, novos cálculos) mas fechado para modificação (não precisa alterar código existente).

## Serviços Principais

### BattleService
**Responsabilidade**: Orquestrar o fluxo completo de batalha
- Coordena todos os outros serviços de batalha
- Processa ataques de monstros
- Gerencia o fluxo: validação → traps → cálculo → destruição

### TrapService
**Responsabilidade**: Gerenciar todas as traps
- Mirror Force
- Dimensional Prison
- Sakuretsu Armor
- Waboku
- Defense Draw
- Trap Hole

**Como adicionar nova trap:**
1. Adicionar método `checkAndActivate[NovaTrap]()` no `TrapService`
2. Chamar o método no fluxo apropriado do `BattleService`
3. Não precisa modificar código existente!

### DamageCalculationService
**Responsabilidade**: Cálculos de dano
- Dano de batalha (ATK vs ATK, ATK vs DEF)
- Dano direto
- Aplicação de dano aos LP
- Verificação de vitória

**Como adicionar novo tipo de dano:**
1. Adicionar método de cálculo no `DamageCalculationService`
2. Usar no `BattleService` ou `MonsterBattleService`
3. Não afeta outros cálculos!

### GraveyardService
**Responsabilidade**: Gerenciamento de cemitério
- Adicionar cartas
- Remover cartas
- Buscar cartas
- Contar cartas

**Como adicionar nova funcionalidade de cemitério:**
1. Adicionar método no `GraveyardService`
2. Usar onde necessário
3. Não afeta outras funcionalidades!

### EquipmentService
**Responsabilidade**: Equipamentos
- Aplicar equipamentos
- Remover equipamentos
- Calcular bônus

### AttackValidationService
**Responsabilidade**: Validações de ataque
- Validar turno e fase
- Validar limites de ataque
- Verificar bloqueios (SwordsOfRevealingLight, etc)

### MonsterBattleService
**Responsabilidade**: Lógica específica de batalha entre monstros
- ATK vs ATK
- ATK vs DEF
- Efeitos de flip durante batalha
- Efeitos especiais (Marshmallon, etc)

### FieldStateService
**Responsabilidade**: Estado do campo
- Sincronizar estado entre memória e banco
- Garantir consistência
- Atualizar campos

## Como Adicionar Novas Funcionalidades

### Exemplo: Adicionar uma nova trap

1. **Criar método no TrapService:**
```typescript
async checkAndActivateNovaTrap(
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  // parâmetros específicos
): Promise<boolean> {
  // Implementação
}
```

2. **Usar no BattleService:**
```typescript
const novaTrapActivated = await this.trapService.checkAndActivateNovaTrap(...);
```

3. **Pronto!** Não precisa modificar código existente.

### Exemplo: Adicionar novo tipo de dano

1. **Adicionar método no DamageCalculationService:**
```typescript
calculateNovoTipoDano(...): number {
  // Implementação
}
```

2. **Usar onde necessário:**
```typescript
const dano = this.damageCalculation.calculateNovoTipoDano(...);
```

3. **Pronto!** Não afeta outros cálculos.

## Benefícios da Arquitetura

1. **Escalabilidade**: Fácil adicionar novas funcionalidades sem quebrar código existente
2. **Manutenibilidade**: Código organizado e fácil de entender
3. **Testabilidade**: Serviços pequenos são fáceis de testar
4. **Colaboração**: Múltiplos desenvolvedores podem trabalhar sem conflitos
5. **Performance**: IDEs funcionam melhor com arquivos menores
6. **Reutilização**: Serviços podem ser reutilizados em outros contextos

## Migração Gradual

A migração está sendo feita gradualmente:
1. ✅ Serviços criados com estrutura base
2. ⏳ Migração de código do `DuelsService` para serviços específicos
3. ⏳ Atualização de dependências
4. ⏳ Testes e validação
5. ⏳ Documentação completa

Durante a migração, o código antigo continua funcionando através de delegação, garantindo zero downtime.

## Convenções

- **Nomes de métodos**: Verbos descritivos (`checkAndActivate`, `calculateDamage`, `addToGraveyard`)
- **Interfaces**: Prefixo `I` ou sufixo `Interface` (opcional, usando tipos TypeScript)
- **Logs**: Sempre usar logger com contexto claro
- **Erros**: Sempre retornar objetos com `success` e `message` quando aplicável
- **Validações**: Sempre validar antes de processar

## Próximos Passos

1. Migrar lógica de traps do `DuelsService` para `TrapService`
2. Migrar cálculo de dano para `DamageCalculationService`
3. Migrar lógica de batalha para `MonsterBattleService`
4. Migrar gerenciamento de cemitério para `GraveyardService`
5. Adicionar testes unitários para cada serviço
6. Documentar APIs públicas de cada serviço

