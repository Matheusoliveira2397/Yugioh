# Auditoria de arquitetura — Yu-Gi-Oh! (23/10/2026)

## Escopo e evidências
Inspeção estática de estrutura, CI, entidades e fluxos críticos do repositório. **Não é um teste de carga nem uma auditoria de produção com acesso ao banco**. As capacidades numéricas mencionadas em documentos antigos de escalabilidade **não são garantias** sem medições.

- Frontend: React/Vite/TypeScript, componentes e páginas.
- Backend: NestJS/TypeORM, REST, Socket.IO, bot, torneios, motor de duelo.
- Persistência: PostgreSQL, estados JSONB de duelo, migrações auxiliares.
- Pipeline: `.github/workflows/build-and-test.yml` compila frontend/backend e executa Jest backend; **não faz testes end-to-end nem teste de concorrência**.

## Achados, prioridade e encaminhamento

| Prioridade | Achado | Risco | Estado |
|---|---|---|---|
| P0 | `finishDuel` atualizava estatísticas/histórico mesmo após finalização duplicada | vitórias, recompensas e histórico duplicados | Mitigado nesta alteração por reivindicação atômica de status no PostgreSQL |
| P0 | `createDuelInternal` apagava a reserva de criação mantida por `createDuel` | janelas de corrida entre solicitações | Corrigido nesta alteração |
| P0 | `Promise.race` de criação liberava a reserva aos 30 s enquanto operação subjacente seguia executando | criação tardia de duelo duplicado | Removida a corrida nesta alteração; estabelecer timeout de banco/cancelamento real posteriormente |
| P0 | exclusividade de duelos protegida apenas por `Set` em memória, sem lock entre instâncias | duelos simultâneos em deploy com múltiplos processos | Pendente — exige transação ou reserva única no PostgreSQL |
| P0 | finalização e contabilização não são uma única transação (persistência, score, missões, bracket) | em falha parcial, duelo encerra sem parte da contabilização | Pendente — adotar outbox e processador idempotente de eventos |
| P1 | `duels.service.ts` supera 20 mil linhas apesar de serviços auxiliares já extraídos | alto acoplamento e regressões em efeitos | Pendente — decomposição orientada a casos de uso por feature flags, sem reescrita abrupta |
| P1 | somente 2 arquivos Jest `.spec` / `.test` em árvore com centenas de arquivos | pouca cobertura de regras e persistência | Pendente — testes de integração PostgreSQL e de contrato WebSocket/REST |
| P1 | código de desempate define cartas por campos `deck`, `hand`, `monsters`, `spellTrap`, `extraDeck` | possíveis divergências com estados reais de zonas | Pendente — validar amostras reais e formalizar `DuelState` tipado |
| P1 | relacionamentos legados de torneio causaram erro `integer = uuid` em banco local | inconsistência de esquema | Pendente — migrações versionadas, validação de esquema e teste PostgreSQL em CI |
| P2 | `SCALABILITY_CHECKLIST.md` afirma quantidade de jogadores suportados sem benchmark verificável | expectativas indevidas de capacidade | Pendente — definir SLOs e teste de carga por cenário |

## Arquitetura-alvo incremental (sem big-bang)

**API / orquestração:** controllers REST, gateway WebSocket, autenticação e autorização. Nenhuma regra do jogo diretamente no controller.

**Aplicação:** `CreateDuelUseCase`, `FinishDuelUseCase`, `StartScheduledMatchUseCase`, `ResolveRoundUseCase`; cada fluxo valida pré-condições e deduplicação (chave idempotente).

**Domínio:** estados imutáveis de duelo, efeitos como comandos/ações validadas, decisões de vencedor e política de horário como funções puras testáveis.

**Infraestrutura:** repositórios TypeORM, transações PostgreSQL, outbox e worker; cache Redis para performance, jamais única fonte de verdade.

**Observabilidade:** logs estruturados com `duelId`, `tournamentId`, `requestId`, métrica de duelos duplicados, latência de ação e filas.

## Sequência de execução proposta

1. **Segurança do estado:** transformar criação de duelo em operação serializada por usuário no banco; usar unicidade para reserva ativa. Introduzir teste de concorrência de duas requisições.
2. **Contabilização confiável:** manter `finishDuel` como alteração atômica; emitir evento `DuelFinished` em outbox transacional; consumidores idempotentes para histórico, pontuação e avanço de torneios.
3. **Contratos:** DTOs de ações/estado e testes de integração para carta oculta, efeitos em cadeia, tempo limite e disputa agendada.
4. **Fatiar o monólito:** extrair pequenas partes de `duels.service.ts` com testes de caracterização antes de mover implementações.
5. **Operação e escala:** migrações TypeORM com rollback, ambientes staging usando Postgres real, `npm run lint` no CI, métricas, testes de carga e release canário.

## Regras para futuras alterações

- Toda correção de efeito de carta precisa de teste de regressão usando estado inicial, ação legal e estado final.
- Todo evento de vitória deve ser idempotente — jamais adicionar score duas vezes por retry.
- Não modificar esquema em `onModuleInit` sem migração versionada e plano de rollback.
- Não fazer merge se CI falhar, e não equiparar build verde a funcionalidade validada em ambiente real.
- Antes de subir mais de uma instância de backend, concluir os locks compartilhados e eliminar divergências entre memória e banco.
