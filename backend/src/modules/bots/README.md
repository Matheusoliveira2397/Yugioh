# Bots gerenciados — executor experimental

## Implantado na branch
- Painel `/admin/bots` disponível só para contas MASTER;
- Criação de usuário técnico do bot, cópia do deck, edição de nível e dificuldade;
- Habilitar/desabilitar um bot e configurar modo `RANDOM` e intervalo de 1 a 10080 minutos;
- Serviço `BotRunnerService` a cada 5 segundos verifica configuração e duelos ativos;
- Bots entram na fila do matchmaking já existente (faixas de nível);
- O executor chama handlers seguros já existentes no `DuelsGateway` para avançar fase, invocar monstros simples e tentar um ataque por turno;
- Limite de ações por turno; bots desabilitados permanecem em duelo em andamento até ele terminar.

## Limitações importantes

**EXPERIMENTAL; NÃO VALIDADO POR BUILD/TESTES E2E.**
Não há ainda inteligência completa para cartas especiais, efeitos pendentes, tributos, combos e decisões de defesa.
O campo `difficulty` afeta apenas a escolha básica de monstro e posição; diferenças estratégicas reais entre HARD e EXPERT ainda estão pendentes.
Partidas que dependam de efeitos interativos podem aguardar timeout. Testar primeiro em homologação, sem jogadores reais.
O backend precisa permanecer online para o agendamento funcionar.

## Banco
Executar `backend/src/modules/bots/create-managed-bots.sql` no PostgreSQL antes de iniciar a aplicação com bots habilitados.
TypeORM está configurado com `synchronize: false`.

## Exemplo
`POST /admin/bots` com JWT da conta Master:
```json
{"name":"Kaiba Bot","deckId":"UUID_DO_DECK","difficulty":"NORMAL","level":5,"participation":"RANDOM","intervalMinutes":30,"enabled":false}
```
Em seguida habilitar pelo painel. O bot participa no modo RANDOM no máximo uma vez por intervalo configurado (contado da última entrada na fila), enquanto não está em duelo.

## Checklist antes de merge
- [ ] Aplicar migration em ambiente de homologação
- [ ] Executar `npm run build` em backend e frontend
- [ ] Testar autenticação e autorização MASTER (PLAYER/ADMIN recebem 403)
- [ ] Testar fila humano vs bot, fases, ataques, encerramento, tempo e desconexão
- [ ] Testar cartas com efeitos pendentes, loop de fase, duel timeout, rematch e desligamento
- [ ] Validar múltiplas instâncias (scheduler atual não tem distributed lock)
