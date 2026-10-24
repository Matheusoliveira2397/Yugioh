# Migração do motor de efeitos — 2026-10

## Objetivo
Um único ponto de entrada para resolver efeitos de cartas; primitivas compartilhadas; carta específica define condições, alvos, custo e sequência. Nenhuma carta pode silenciosamente executar um segundo efeito depois de falha.

## Estado real desta alteração
- Toda ativação de magia via `DuelsService` identificada no caminho principal foi direcionada para `CardEffectsService.processCardEffect`.
- As cartas **registradas** são resolvidas por `CardEffectRegistryService` (match exato), sem reexecutar pelo legado em caso de erro.
- Para cartas **ainda não registradas**, existe um adaptador temporário que encaminha ao `DuelsService.processCardEffect`, para preservar jogabilidade. Isso significa que **a migração de todas as implementações ainda NÃO terminou**.
- Criadas primitivas tipadas e testáveis em `primitives/effect-operations.ts` para LP, compra, envio de mágicas/armadilhas e monstros ao cemitério.
- Magias simples foram iniciadas na adoção dessas operações compartilhadas.

## Dívida que impede desativar o legado
1. Inventariar cada identificador e alias resolvido pelo método legado; cruzar com o registro central para detectar cartas sem implementação.
2. Criar efeito registrado para cada uma, priorizando as cartas usadas por bots e decks ativos.
3. Migrar as ações de flip, gatilhos e armadilhas que ainda estão em métodos específicos — não basta migrar a chamada de magia.
4. Centralizar a elegibilidade, seleção de alvos, custo e chain no motor antes da mutação de campos.
5. Extrair dependências de `DuelsService` de dentro das classes de efeitos, evitando dependência circular e escrita direta de banco.
6. Adicionar testes de caracterização por carta com estado inicial/final, timing, chain, imunidades e regressão.
7. Remover o adaptador legado **somente após um teste de cobertura de 100% das cartas ativas**.

## Compatibilidade e segurança
Não remova `processCardEffect` do serviço antigo enquanto a cobertura não estiver comprovada. É melhor um único ponto de entrada com implementação mista temporária do que quebrar cartas por remoção prematura.

## Arquitetura final
- `EffectRegistry`: `cardId -> EffectDefinition`, registro exato, sem ambiguidades.
- `EffectExecutor`: valida custo/alvo, cria chain, resolve, aplica primitivas e emite eventos.
- `EffectOperations`: movimentos de zonas, LP, compra, destruição, banimento, invocação etc.
- `EffectDefinition`: composição de operações, regras e escolhas específicas de uma carta.
- `DuelStateRepository`: commits consistentes; não há persistência dentro de cada carta.

## Definition of Done
- Todas as cartas com efeitos ativos presentes no registro central.
- Não há chamadas diretas ao executor legado.
- Testes de regras/efeitos passam, inclusive combates e duelos com múltiplas chains.
- Duelos de bots usam o mesmo executor.
- Sem perda de compatibilidade com cartas já emitidas no banco.
