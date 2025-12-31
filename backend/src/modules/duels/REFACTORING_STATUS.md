# Status da Refatoração do DuelsService

## Problema Identificado
O DuelsService ainda tem ~14.800 linhas porque apenas delegamos métodos, mas não removemos o código original.

## Métodos que PRECISAM ser movidos e REMOVIDOS do DuelsService

### CardEffectHandlersService (10 handlers restantes - ~5000+ linhas)
- [x] processForcefulSentryChoice - MOVIDO
- [x] processConfiscationChoice - MOVIDO  
- [x] processGracefulCharityChoice - MOVIDO
- [x] processMonsterRebornChoice - MOVIDO
- [ ] processAutonomousActionUnitChoice - ~160 linhas - PRECISA MOVER
- [ ] processCyberSteinEffectChoice - ~200 linhas - PRECISA MOVER
- [ ] processChangeOfHeartChoice - ~80 linhas - PRECISA MOVER
- [ ] processSoulTakerChoice - ~90 linhas - PRECISA MOVER
- [ ] processBrainControlChoice - ~160 linhas - PRECISA MOVER
- [ ] processUnitedWeStandChoice - ~180 linhas - PRECISA MOVER
- [ ] processMagePowerChoice - ~170 linhas - PRECISA MOVER
- [ ] processMysticalSpaceTyphoonChoice - ~140 linhas - PRECISA MOVER
- [ ] processSnowmanEaterChoice - ~90 linhas - PRECISA MOVER

### FieldActionsService (~3000+ linhas)
- [ ] placeCardOnField - ~500 linhas - PRECISA MOVER
- [ ] attackMonster - ~700 linhas - PRECISA MOVER
- [ ] normalSummonMonster - ~450 linhas - PRECISA MOVER
- [ ] changeMonsterPosition - ~200 linhas - PRECISA MOVER
- [ ] flipMonster - ~200 linhas - PRECISA MOVER

### TurnPhaseService (~1000+ linhas)
- [ ] processDrawPhase - ~100 linhas - PRECISA MOVER
- [ ] advanceToNextTurn - ~900 linhas - PRECISA MOVER

## Total estimado a remover: ~9000+ linhas

## Estratégia
1. Mover código completo para os serviços
2. Substituir métodos no DuelsService por delegações simples (1-2 linhas)
3. REMOVER código antigo completamente
4. Verificar redução de linhas

