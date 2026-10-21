# Bots gerenciados — IA estratégica

## Como joga

O bot decide como um duelist humano, **sem inventar ações ilegais**:

1. **Catálogo de ações legais** (`bot-legal-actions.ts`) — magias, traps, invocações (incl. tributo), efeitos de monstro e ataques, filtrados pelas condições do efeito
2. **Taxonomia de efeitos** (`bot-effect-taxonomy.ts`) — classifica qualquer carta por papéis (`draw`, `removal`, `revive`, `steal`…) via registro + description; a IA avalia papéis, não listas fixas de “cartas populares”
3. **Avaliação de estado** (`bot-evaluator.ts`) — vantagem de cartas, campo, LP, ameaça, lethal
4. **Combos** (`bot-combo.ts`) — detecta linhas (draw primeiro, revive, clear→swing, bosses)
5. **Perfil de deck** (`bot-deck-profile.ts`) — aggro / control / combo / midrange / stall automático
6. **Batalha** (`bot-battle.ts`) — trades, ordem de ataques, lethal
7. **Respostas** (`bot-response.ts`) — alvos de pending + traps manuais no turno do oponente
8. **Motor estratégico** (`bot-strategy.ts`) — pontua cada ação conforme dificuldade
9. **Memória** (`uploads/bot-ai-memory.json`) — reforça jogadas bem-sucedidas
10. **LLM opcional** — com `BOT_AI_API_KEY`, escolhe entre ações legais usando a dica do motor

## Dificuldade (mesmo motor de regras)

| Nível    | Comportamento |
|----------|----------------|
| EASY     | Usa efeitos e regras; erros ocasionais (`blunder`); menos preservação |
| NORMAL   | Combos básicos, trades e respostas evidentes |
| HARD     | Lookahead raso, preserva recursos, prioriza combos |
| EXPERT   | Melhor avaliação, linhas de lethal/combo, respostas seletivas |

A dificuldade **não** dá cartas extras nem burla regras — só muda qualidade da escolha.

## Ativar bots

1. Painel `/admin/bots` (MASTER)
2. Crie bot com deck, escolha a dificuldade, participação **RANDOM**, enabled
3. Duele na fila RANDOM ou desafie o bot

### LLM (opcional)

```env
BOT_AI_ENABLED=true
BOT_AI_API_KEY=sk-...
BOT_AI_MODEL=gpt-4o-mini
```

## Testes, benchmark e treino

```bash
cd backend
npm run test:bot-ai              # unitários da IA
npm run simulate:bot-ai          # benchmark + self-play heurístico (sem DB)
npm run train:bot-ai             # 25 partidas bot-vs-bot → memória
npm run train:bot-ai -- --games=50
npm run train:bot-ai:loop        # treino contínuo (Ctrl+C para parar)
```

O treino grava em `uploads/bot-ai-memory.json`. Reinicie o backend para o `BotExperienceService` carregar as lições novas em duelos reais.

Cenários do benchmark: draw-first, Breaker, Chaos removal, mão > 6, lethal, Skilled Dark Magician.

**Plano contínuo (nível Tag Force forte):**
1. Cada efeito novo no gateway → entrada em `bot-legal-actions` + pending/CHOICE
2. Rodar `simulate:bot-ai` após mudanças
3. Rodar `train:bot-ai` (bots jogando um contra o outro) para reforçar a memória
4. Memória reforça jogadas boas também em duelos reais
5. RL profundo só depois de um simulador completo do motor de regras

## Arquivos principais

| Arquivo | Função |
|---------|--------|
| `bot-ai.service.ts` | Orquestra decisão / LLM / resposta |
| `bot-runner.service.ts` | Executa no duelo real (próprio turno + pending + respostas) |
| `bot-strategy.ts` | Scoring por dificuldade |
| `bot-effect-taxonomy.ts` | Papéis de efeito reutilizáveis |
| `bot-simulation.ts` | Helpers de teste / bateria de decisões |

## Filosofia (como Tag Force / WindBot / YGO Agent)

| Abordagem | O que é | Neste projeto |
|-----------|---------|----------------|
| **Heurística (Tag Force)** | Regras + prioridades: maior ATK, remoção, set, mão | **Principal** — `bot-strategy` + taxonomia |
| **Memória de casos** | Reforça jogadas que deram certo | `bot-ai-memory.json` |
| **LLM opcional** | Escolhe entre ações legais | `BOT_AI_API_KEY` |
| **RL profundo (ygo-agent)** | Treino com milhões de duelos no ygopro-core | Fora de escopo agora (exige motor de simulação massiva) |

Tag Force **não** “aprende” sozinho como AlphaGo: usa IA por regras/prioridades por personagem/deck. Melhoramos o mesmo modelo, com políticas explícitas (ex.: **não descartar à toa** com mão > 6, usar Breaker quando há backrow).

## Limitações conhecidas

- Traps de batalha (Mirror Force, Sakuretsu, Bottomless) ainda **ativam automaticamente** no motor; a IA decide set/hold e alvos manuais
- Efeitos de monstro novos precisam de ação no gateway (`START_*` / `BREAKER_REMOVE_COUNTER` etc.); a IA então passa a usá-los sem regra “por situação” manual
- Cartas sem `description` e fora do registro caem em perfil genérico
- Lookahead heurístico (não MCTS/RL completo) para manter bot vs bot rápido
