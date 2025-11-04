# 🏆 SISTEMA DE TORNEIOS AUTOMATIZADO - GUIA COMPLETO

## **✅ FUNCIONALIDADES IMPLEMENTADAS**

### **1. Automação Completa**
- ✅ Inscrições abrem/fecham automaticamente
- ✅ Sorteio automático no horário definido
- ✅ Partidas iniciam automaticamente
- ✅ Avanço automático de fases
- ✅ Distribuição automática de prêmios

### **2. Formatos Suportados**
- `single_elimination` - Mata-mata (padrão)
- `double_elimination` - Dupla eliminação
- `swiss` - Sistema Suíço
- `round_robin` - Todos contra todos

### **3. Status do Torneio**
- `scheduled` - Agendado (aguardando abertura)
- `registration_open` - Inscrições abertas
- `registration_closed` - Inscrições fechadas
- `in_progress` - Em andamento
- `finished` - Finalizado
- `cancelled` - Cancelado

---

## **📝 EXEMPLOS DE USO**

### **1. Criar Torneio (Admin)**

```bash
POST /tournaments
Authorization: Bearer <admin-token>

{
  "name": "Torneio de Sexta à Noite",
  "description": "Torneio semanal com premiação em moedas",
  "format": "single_elimination",
  "maxParticipants": 16,
  
  "registrationOpenAt": "2025-11-08T18:00:00.000Z",
  "registrationCloseAt": "2025-11-08T19:45:00.000Z",
  "startAt": "2025-11-08T20:00:00.000Z",
  
  "prizeFirst": 1000,
  "prizeSecond": 500,
  "prizeThird": 250,
  
  "entryFee": 50,
  "turnDuration": 90,
  "matchDuration": 1800,
  
  "autoStartMatches": true,
  "autoAdvancePhases": true
}
```

**Resposta:**
```json
{
  "id": "uuid-do-torneio",
  "name": "Torneio de Sexta à Noite",
  "status": "scheduled",
  "currentParticipants": 0,
  ...
}
```

---

### **2. Listar Torneios**

```bash
GET /tournaments
```

**Com filtro:**
```bash
GET /tournaments?status=registration_open
```

---

### **3. Inscrever-se no Torneio**

```bash
POST /tournaments/{tournamentId}/register
Authorization: Bearer <user-token>
```

**Validações automáticas:**
- ✅ Verifica se inscrições estão abertas
- ✅ Verifica se há vagas
- ✅ Cobra taxa de inscrição
- ✅ Previne inscrição duplicada

---

### **4. Ver Detalhes do Torneio**

```bash
GET /tournaments/{tournamentId}
```

**Resposta:**
```json
{
  "id": "uuid",
  "name": "Torneio de Sexta à Noite",
  "status": "in_progress",
  "currentRound": 2,
  "currentParticipants": 16,
  "maxParticipants": 16,
  "participants": [
    {
      "id": "uuid",
      "userId": "user-id",
      "user": { "username": "Player1", ... },
      "status": "active",
      "wins": 2,
      "losses": 0,
      "seed": 1
    },
    ...
  ],
  "matches": [
    {
      "id": "match-id",
      "round": 1,
      "matchNumber": 1,
      "player1": { "username": "Player1" },
      "player2": { "username": "Player2" },
      "winner": { "username": "Player1" },
      "status": "finished",
      "duelId": "duel-uuid"
    },
    ...
  ]
}
```

---

## **⚙️ COMO FUNCIONA A AUTOMAÇÃO**

### **Cron Job (Executa a cada 1 minuto)**

O sistema verifica automaticamente:

#### **1. Abrir Inscrições** *(18:00)*
```
Status: scheduled → registration_open
Log: "🔓 Inscrições abertas para torneio: Torneio de Sexta à Noite"
```

#### **2. Fechar Inscrições** *(19:45 ou quando completar)*
```
Status: registration_open → registration_closed
Log: "🔒 Inscrições fechadas para torneio: Torneio de Sexta à Noite"
```

#### **3. Iniciar Torneio (Sorteio)** *(20:00)*
```
- Embaralha participantes aleatoriamente
- Atribui seeds (1, 2, 3, ...)
- Cria chave de jogos
- Status: registration_closed → in_progress
Log: "🎲 Sorteio realizado para torneio: Torneio de Sexta à Noite"
```

#### **4. Iniciar Partidas Automaticamente**
```
- Verifica partidas agendadas
- Cria duelo automaticamente
- Liga duelo à partida do torneio
- Status: ready → in_progress
Log: "⚔️ Duelo iniciado automaticamente: Player1 vs Player2"
```

#### **5. Avançar Fases Automaticamente**
```
- Verifica se todas as partidas da rodada terminaram
- Move vencedores para próxima fase
- Agenda próximas partidas
- Incrementa currentRound
Log: "📈 Torneio avançou para rodada 2"
```

#### **6. Finalizar Torneio**
```
- Identifica vencedor final
- Distribui prêmios
- Status: in_progress → finished
Log: "🏆 Torneio finalizado!"
Log: "💰 Prêmio de 1000 moedas entregue ao vencedor"
```

---

## **📊 ESTRUTURA DA CHAVE (16 jogadores)**

### **Rodada 1 - Oitavas** *(8 partidas)*
```
Partida 1: Seed 1  vs Seed 2  → Vencedor → Partida 9
Partida 2: Seed 3  vs Seed 4  → Vencedor → Partida 9
Partida 3: Seed 5  vs Seed 6  → Vencedor → Partida 10
Partida 4: Seed 7  vs Seed 8  → Vencedor → Partida 10
Partida 5: Seed 9  vs Seed 10 → Vencedor → Partida 11
Partida 6: Seed 11 vs Seed 12 → Vencedor → Partida 11
Partida 7: Seed 13 vs Seed 14 → Vencedor → Partida 12
Partida 8: Seed 15 vs Seed 16 → Vencedor → Partida 12
```

### **Rodada 2 - Quartas** *(4 partidas)*
```
Partida 9:  Vencedor P1 vs Vencedor P2 → Partida 13
Partida 10: Vencedor P3 vs Vencedor P4 → Partida 13
Partida 11: Vencedor P5 vs Vencedor P6 → Partida 14
Partida 12: Vencedor P7 vs Vencedor P8 → Partida 14
```

### **Rodada 3 - Semifinais** *(2 partidas)*
```
Partida 13: Vencedor P9  vs Vencedor P10 → Partida 15
Partida 14: Vencedor P11 vs Vencedor P12 → Partida 15
```

### **Rodada 4 - Final** *(1 partida)*
```
Partida 15: Vencedor P13 vs Vencedor P14 → CAMPEÃO! 🏆
```

---

## **🎯 CENÁRIO COMPLETO**

### **Quinta-feira, 10:00**
Admin cria torneio para sexta à noite

### **Sexta-feira, 18:00** *(AUTOMÁTICO)*
✅ Inscrições abrem
📢 Notificação para players

### **Sexta-feira, 18:00 - 19:45**
Players se inscrevem via `/tournaments/{id}/register`

### **Sexta-feira, 19:45** *(AUTOMÁTICO)*
✅ Inscrições fecham
📊 16 players inscritos

### **Sexta-feira, 20:00** *(AUTOMÁTICO)*
✅ Sorteio realizado
🎲 Chave gerada
⚔️ Primeira rodada (8 duelos) agendada para 20:00

### **Sexta-feira, 20:00** *(AUTOMÁTICO)*
✅ 8 duelos iniciam automaticamente

### **Sexta-feira, ~20:30** *(AUTOMÁTICO)*
✅ Primeira rodada termina
✅ Sistema avança para quartas de final
⚔️ 4 duelos agendados para 20:35

### **Sexta-feira, ~21:00** *(AUTOMÁTICO)*
✅ Quartas terminam
✅ Semifinais começam

### **Sexta-feira, ~21:30** *(AUTOMÁTICO)*
✅ Final começa

### **Sexta-feira, ~22:00** *(AUTOMÁTICO)*
✅ Torneio finaliza
🏆 Vencedor declarado
💰 Prêmios distribuídos
📊 Estatísticas salvas

---

## **🔧 CONFIGURAÇÕES AVANÇADAS**

### **Espaçamento entre Partidas**
```typescript
// No código: tournaments.service.ts linha ~289
scheduledAt: new Date(startTime.getTime() + (i / 2) * 30 * 60 * 1000)
// 30 minutos entre cada dupla de partidas
```

### **Tempo entre Rodadas**
```typescript
// Linha ~315
scheduledAt: new Date(tournament.startAt.getTime() + (round - 1) * 60 * 60 * 1000)
// 1 hora por rodada
```

### **Taxa de Inscrição**
```typescript
entryFee: 50 // Cobra 50 moedas de cada player
```

---

## **✨ PRÓXIMAS MELHORIAS**

1. ✅ Sistema de notificações (WebSocket)
2. ✅ Frontend para visualizar chaves
3. ✅ Histórico de torneios do player
4. ✅ Ranking de torneios
5. ✅ Torneios recorrentes (semanais/mensais)
6. ✅ Sistema de check-in (player confirma presença)
7. ✅ Walkover automático (player não aparece)

---

**🎮 Sistema 100% automatizado e pronto para uso!**
