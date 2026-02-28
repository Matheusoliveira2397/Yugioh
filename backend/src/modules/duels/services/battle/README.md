# Serviços de Batalha

Este diretório contém todos os serviços relacionados à lógica de batalha no duelo.

## Serviços

### BattleService
Orquestra todo o fluxo de batalha. Coordena os outros serviços para processar ataques.

### TrapService
Gerencia todas as traps do jogo:
- Mirror Force
- Dimensional Prison
- Sakuretsu Armor
- Waboku
- Defense Draw
- Trap Hole

**Como adicionar nova trap:**
1. Adicionar método `checkAndActivate[NovaTrap]()` no `TrapService`
2. Implementar a lógica da trap
3. Chamar no fluxo apropriado do `BattleService`

### DamageCalculationService
Calcula dano de batalha e aplica aos Life Points.

**Métodos principais:**
- `calculateBattleDamage()` - Calcula dano entre dois monstros
- `calculateDirectAttackDamage()` - Calcula dano de ataque direto
- `applyDamage()` - Aplica dano aos LP e verifica vitória

### GraveyardService
Gerencia o cemitério (adicionar, remover, buscar cartas).

### EquipmentService
Gerencia equipamentos (aplicar, remover, calcular bônus).

### AttackValidationService
Valida se um ataque pode ser realizado:
- Verifica turno e fase
- Verifica limites de ataque
- Verifica bloqueios

### MonsterBattleService
Lógica específica de batalha entre monstros:
- ATK vs ATK
- ATK vs DEF
- Efeitos de flip durante batalha

### FieldStateService
Gerencia estado do campo (sincronização memória/banco).

## Uso

```typescript
// Exemplo: Processar ataque
const result = await battleService.attackMonster(duelId, userId, attackerIndex, targetIndex);

// Exemplo: Verificar trap
const mirrorForceActivated = await trapService.checkAndActivateMirrorForce(duelId, duel, isPlayer1);

// Exemplo: Calcular dano
const damage = damageCalculation.calculateBattleDamage(attackerAtk, targetAtk, targetDef, position);
```

## Dependências

- `DuelsService` - Para acesso ao banco e métodos principais
- `DuelUtilsService` - Para utilitários
- `CardEffectsService` - Para efeitos de cartas

## Interfaces

Ver `interfaces/battle.interface.ts` para tipos e interfaces.

