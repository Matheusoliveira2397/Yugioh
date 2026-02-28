# Segurança – Yugioh (jogo escalável)

Este documento descreve as regras de segurança para evitar que o jogo seja hackeado pelo front-end (ex.: DevTools, alteração de requests, inspeção de rede).

## Princípio fundamental: nunca confiar no cliente

- **Servidor é a única fonte da verdade** para: estado do duelo, vida, cartas, turno, fase, recompensas.
- O front-end é apenas uma **visualização**. Qualquer dado exibido pode ser alterado pelo usuário (inspect, console, requisições modificadas).
- Toda **validação e lógica de negócio** deve ocorrer no **backend**. O cliente só envia intenções (ex.: “jogar carta X na zona Y”); o servidor valida e aplica.

---

## WebSocket (duels.gateway)

### Identidade do usuário

- O **userId** usado em todas as ações (duelAction, endTurn, nextPhase, joinDuelRoom, etc.) deve ser **sempre** o que veio do **JWT** na conexão do socket, armazenado em `client.data.userId`.
- **Nunca** usar `data.userId` (ou qualquer userId vindo no payload) para autorização. Um atacante pode enviar `userId: 999` e tentar agir como outro jogador.
- Na prática: em todos os handlers, usar apenas `const userId = client.data.userId;` (e verificar `if (!userId)` quando necessário).

### Autenticação do socket

- O gateway já usa middleware que valida o JWT em `handshake.auth.token` (ou header `Authorization`) e define `socket.data.userId`.
- Sem token válido, a conexão é rejeitada. Não há “ação anônima” no duelo.

### Validação de ações

- Para cada ação (invocar monstro, jogar magia, atacar, mudar fase, etc.):
  - Confirmar que o **duelo existe** (cache ou banco).
  - Confirmar que o **usuário é jogador** do duelo (player1Id ou player2Id).
  - Confirmar que é **o turno desse jogador** quando a regra exigir.
  - Confirmar **fase** (ex.: ataque só em BATTLE).
  - Aplicar a ação no **estado do duelo no servidor** (DuelsService); nunca sobrescrever estado com dados enviados pelo cliente (ex.: não aceitar “meu lifePoints agora é 8000” vindo do client).

---

## APIs REST

- Usar **sempre** `req.user.id` (ou equivalente do guard JWT) para identificar o usuário em rotas protegidas.
- **Nunca** usar `req.body.userId` ou `req.query.userId` para decidir “quem é o usuário” em operações sensíveis (perfil, compras, recompensas, inventário).
- Controllers que já usam `req.user.id` (users, shop, news, groups, etc.) estão alinhados com isso.

---

## Recompensas e economia

- Vitória/derrota e **recompensas** (score, cash, itens) são calculadas e aplicadas **somente no servidor**, em `finishDuel` (ou equivalente), com base no estado do duelo (life points, surrender, etc.).
- O cliente **nunca** envia “eu ganhei” ou “me dê X de ouro”. O servidor determina o resultado e credita/debita.

---

## Checklist para novas funcionalidades

1. **Novo evento WebSocket**  
   Usar apenas `client.data.userId`. Não usar `data.userId` para autorização.

2. **Nova ação de duelo**  
   No gateway: validar duelo, jogador, turno/fase. No service: aplicar a ação sobre o estado do duelo em memória/banco; não aceitar “estado completo” vindo do cliente.

3. **Nova rota REST sensível**  
   Proteger com guard JWT e usar `req.user.id` (ou `req.user`) para identificar o usuário.

4. **Dados sensíveis no front**  
   Não armazenar tokens, senhas ou “chaves de admin” no front-end. Tokens JWT são necessários para conexão; manter em memória ou storage seguro e usar HTTPS em produção.

---

## Resumo

| Onde        | Fonte de verdade para “quem é o usuário” | Não usar para autorização   |
|------------|-------------------------------------------|-----------------------------|
| WebSocket  | `client.data.userId` (do JWT)             | `data.userId` do payload    |
| REST       | `req.user.id` (do JWT)                    | `req.body.userId` / query  |
| Estado do duelo | Servidor (DuelsService + banco)     | Qualquer estado enviado pelo client |

Com isso, mesmo que alguém altere o front (inspect, scripts, requests modificados), o servidor continua validando identidade e regras, e o jogo permanece íntegro e escalável.
