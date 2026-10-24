# Reestruturação dos efeitos — inventário e migração segura

## Situação
- Entrada principal de magias: `CardEffectsService.processCardEffect` consulta o registry por nome/ID exatos.
- Cartas registradas não caem no legado em caso de erro.
- Cartas **não registradas** continuam, por enquanto, no `DuelsService.processCardEffect`: remover esse fallback sem migrá-las desligaria efeitos existentes.
- FLIP effects e respostas de escolhas possuem caminhos dedicados; ainda não podem ser descritos como motor único.
- `DuelsService` tem cerca de 20 mil linhas, com duplicações que devem ser extraídas por testes de caracterização.

## Reutilização implementada
- `card-effects/primitives/effect-operations.ts`: `changeLifePoints`, `payLifePoints`, `drawFromDeck`, `sendSpellTrapToGraveyard`, `moveMonsterToGraveyard`, `fieldForSide`, `opponentOf`.
- 21 blocos de descarte de magias em `simple-effects.ts` substituídos pela mesma primitiva com resultado equivalente.
- Testes para as primitivas de estado; sem assumir que a função `moveMonsterToGraveyard` implementa imunidade, destruição ou chains. Essas verificações pertencem ao motor antes da operação.

## Ainda necessário para motor realmente único
1. Listar cada carta do fallback com IDs canônicos e respectivos efeitos; registrar com match exato no registry e testes reais de resultado/custo/targets.
2. Mover FLIP, gatilhos, respostas e escolhas para um despachante de eventos `OnSummon/OnFlip/OnActivate/OnDamage/OnChainResolve`.
3. Introduzir `DuelAction` tipado, checagem de ativação e custo antes de mutações, resultado `EffectResolution` explícito e transação por ação.
4. Centralizar proteção, target legality, cadeia e desempate; carta deve orquestrar primitivas, não alterar banco nem encerrar duelo diretamente.
5. Migrar incrementalmente mantendo testes para cada carta antes de remover a antiga rota. CI e staging precisam verificar combos e timing.

**Não remover fallback até o último efeito legado ter substituto verificado.**
