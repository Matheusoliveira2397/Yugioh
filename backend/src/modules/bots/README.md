# Bots gerenciados (primeira etapa)

A conta **MASTER** pode cadastrar bots com nome, deck, nível, dificuldade e plano de participação no Random Duel.

- GET /admin/bots — listar
- POST /admin/bots — criar conta sintética e copiar deck
- PATCH /admin/bots/:id — configurar
- DELETE /admin/bots/:id — desativar conta sem apagar histórico

Exemplo POST:

```json
{"name":"Kaiba Bot","deckId":"UUID_DO_DECK","difficulty":"HARD","level":25,"participation":"RANDOM","intervalMinutes":30}
```

O módulo está registrado em AppModule e as rotas exigem JwtAuthGuard + MasterGuard.

## Migração obrigatória

Executar `backend/src/modules/bots/create-managed-bots.sql` no PostgreSQL antes de usar as rotas, pois `synchronize=false`.

## Pendente (não ativar em produção)

A UI de administração, o agendador, o matchmaking com socket virtual e o controlador de ações e efeitos de cartas ainda não foram integrados. Por segurança, `enabled=true` é recusado para que um bot incompleto não trave duelos de jogadores. Este primeiro commit é apenas a fundação do cadastro e da configuração.
