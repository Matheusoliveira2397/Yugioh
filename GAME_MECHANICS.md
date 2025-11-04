# 🎮 Mecânicas do Jogo Yu-Gi-Oh!

## 📊 Sistema de Níveis

- **Progressão**: Duelistas ganham XP duelando
- **Level Up**: XP acumulado aumenta o nível do duelista
- **Sem limite definido**: Nível pode crescer indefinidamente

---

## 🏆 Sistema de Seasons

### Estrutura Básica
- **Duração**: A definir (dias por season)
- **Reset Periódico**: Cada season reinicia o ranking
- **Histórico**: Seasons anteriores são arquivadas

### Ranking da Season
- **Competição**: Disputa de ranking durante a season ativa
- **Premiação**: Top 3 recebem troféus
  - 🥇 1º Lugar - Troféu Ouro
  - 🥈 2º Lugar - Troféu Prata
  - 🥉 3º Lugar - Troféu Bronze

### Divisões
- **Sistema de Ligas**: A definir
- **Promoção/Rebaixamento**: Baseado no desempenho
- **Exemplos possíveis**:
  - Bronze
  - Prata
  - Ouro
  - Platina
  - Diamante
  - Mestre
  - Lendário

---

## 📈 Sistema de Score

### Score da Season (Temporário)
- **Escopo**: Apenas da season atual
- **Reset**: Volta a 0 no início de cada season
- **Uso**: Ranking da season

### Score Geral (Permanente)
- **Acumulação**: Soma de todos os scores de todas as seasons
- **Persistente**: Nunca reseta
- **Uso**: Ranking geral do jogo
- **Fórmula**: `Score Geral = Σ (Scores de todas as seasons)`

---

## 👥 Sistema de Grupos (Clãs)

### Estrutura
- **Criação**: Qualquer duelista pode criar um grupo
- **Entrada**: Outros duelistas podem entrar
- **Hierarquia**: Líder, Membros, etc.

### Pontuações do Grupo

#### 1. Score Semanal (Individual no Grupo)
- **Período**: 7 dias (segunda a domingo)
- **Reset**: Todo início de semana
- **Tracking**: Score que o duelista fez jogando pelo grupo na semana

#### 2. Score da Season (Individual no Grupo)
- **Período**: Duração da season
- **Reset**: A cada nova season
- **Tracking**: Score que o duelista fez jogando pelo grupo durante a season

#### 3. Score Geral (Individual no Grupo)
- **Período**: Desde que entrou no grupo
- **Persistente**: Nunca reseta
- **Tracking**: Score total acumulado do duelista dentro do grupo

### Rankings do Grupo
- Ranking semanal dos membros
- Ranking da season dos membros
- Ranking geral dos membros
- Ranking entre grupos (comparação de grupos)

---

## 💰 Sistema de Economia

### Três Moedas Diferentes

#### 1. 🪙 Moedas (Coins/Gold)
- **Obtenção**: Ganhas ao duelar, completar missões
- **Uso**: Comprar cartas comuns, pacotes básicos
- **Tipo**: Moeda in-game (grátis)

#### 2. 💳 Crédito
- **Obtenção**: Recompensas especiais, eventos, torneios
- **Uso**: Comprar cartas raras, itens especiais
- **Tipo**: Moeda premium (pode ser ganha jogando)

#### 3. 💎 Cash (Gemas/Cristais)
- **Obtenção**: Compra com dinheiro real (microtransações)
- **Uso**: Itens premium, aceleração, cosméticos exclusivos
- **Tipo**: Moeda premium (paga)

---

## 🎯 Resumo das Mecânicas

```
DUELISTA
├── Nível (XP de duelos)
├── Score da Season (temporário)
├── Score Geral (permanente)
├── Divisão (Bronze, Prata, Ouro...)
├── Ranking da Season
├── Ranking Geral
├── Moedas 🪙
├── Crédito 💳
├── Cash 💎
└── Grupo (opcional)
    ├── Score Semanal no Grupo
    ├── Score da Season no Grupo
    └── Score Geral no Grupo

SEASON
├── Duração: X dias
├── Ranking competitivo
├── Divisões
└── Premiação (Top 3 = Troféus)

GRUPO
├── Membros
├── Rankings (Semanal, Season, Geral)
├── Score coletivo
└── Competição entre grupos
```

---

## 📝 Notas de Implementação

### Próximos Passos
- [ ] Definir duração das seasons
- [ ] Definir nomes e requisitos das divisões
- [ ] Criar tabelas no banco para:
  - Seasons
  - Season_Rankings
  - Groups
  - Group_Members
  - Group_Scores
  - Transactions (economia)
- [ ] Sistema de XP e level up
- [ ] Cálculo de score (vitórias, derrotas, etc)
- [ ] Interface de grupos
- [ ] Loja (moedas, crédito, cash)

### Perguntas Pendentes
- Quantos dias dura uma season?
- Quantas divisões terão?
- Como o score é calculado? (pontos por vitória, bônus, etc)
- Haverá decay de score (inatividade)?
- Limite de membros por grupo?
- Taxa para criar grupo?
