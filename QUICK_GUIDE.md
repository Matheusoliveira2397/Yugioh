# 🎮 Yu-Gi-Oh! Online - Guia Visual Rápido

## 🚀 3 Passos para Jogar

### 1️⃣ Clone o Projeto
```bash
git clone https://github.com/Matheusoliveira2397/Yugioh.git
cd Yugioh
```

### 2️⃣ Inicie com Docker
```bash
docker-compose up -d
```

### 3️⃣ Acesse o Jogo
Abra: **http://localhost:5173**

---

## 📊 Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                   │
│                    http://localhost:5173                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTP/WebSocket
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (NestJS)                          │
│                    http://localhost:3000                     │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Auth    │  │  Users   │  │  Duel    │  │  Chat    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Cards   │  │  Decks   │  │  Shop    │  │  Arena   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Groups  │  │Tournaments│  │  News    │  │  Admin   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
         ▼           ▼           ▼
┌──────────────┐ ┌──────┐ ┌──────────┐
│  PostgreSQL  │ │ Redis│ │ MongoDB  │
│              │ │      │ │          │
│ • Users      │ │Cache │ │ • Chat   │
│ • Cards      │ │      │ │ • Logs   │
│ • Decks      │ │      │ │          │
│ • Duels      │ │      │ │          │
└──────────────┘ └──────┘ └──────────┘
```

---

## 🎯 Fluxo de Funcionalidades

### 🔐 Autenticação
```
Registro → Verificação Email → Login → JWT Token → Acesso
```

### ⚔️ Sistema de Duelo
```
Random Duel → Matchmaking → Duel Arena → Turnos → Resultado
                ↓
         WebSocket Real-time
                ↓
    Player 1 ←→ Player 2
```

### 🏆 Sistema de Torneios
```
Criação → Inscrições → Início → Brackets → Rodadas → Campeão
    ↓
Admin Panel
```

### 🃏 Deck Building
```
Inventário → Deck Builder → Salvar → Usar em Duelo
    ↓
Loja de Cartas (compra com gemas)
```

---

## 🌐 Deploy - Arquitetura em Produção

```
┌─────────────────────────────────────────────────────────────┐
│                         VERCEL                               │
│                     (Frontend React)                         │
│                  https://seu-app.vercel.app                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTPS/WSS
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                        RAILWAY                               │
│                     (Backend NestJS)                         │
│              https://seu-backend.railway.app                 │
│                                                              │
│  ┌────────────────┐  ┌──────────┐  ┌───────────┐           │
│  │   PostgreSQL   │  │  Redis   │  │  MongoDB  │           │
│  │   (Railway)    │  │(Railway) │  │ (Railway) │           │
│  └────────────────┘  └──────────┘  └───────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### Custos Mensais
- **Vercel**: Grátis (Hobby Plan)
- **Railway**: $5 grátis/mês (suficiente para testes)
- **Total**: Grátis para começar!

---

## 📱 Telas Principais

### 🏠 Home Page
```
┌─────────────────────────────────────────────────────┐
│  🎮 Yu-Gi-Oh! Online                    [Perfil] [⚙️]│
├─────────────────────────────────────────────────────┤
│                                                     │
│  🏆 TOP 5 JOGADORES      📰 NOTÍCIAS               │
│  ┌──────────────┐        ┌──────────────┐          │
│  │ 1. Player1   │        │ Novo torneio│          │
│  │ 2. Player2   │        │ iniciando... │          │
│  │ 3. Player3   │        └──────────────┘          │
│  └──────────────┘                                   │
│                                                     │
│  🛡️ TOP 5 CLÃS          ⚔️ ARENA DE DESAFIOS       │
│  ┌──────────────┐        ┌──────────────┐          │
│  │ 1. Guild1    │        │ 🎯 ATIVA     │          │
│  │ 2. Guild2    │        │ Bônus: 1.5x  │          │
│  │ 3. Guild3    │        │ Tempo: 1:30h │          │
│  └──────────────┘        │ [ENTRAR]     │          │
│                          └──────────────┘          │
│                                                     │
│  [⚔️ DUELO ALEATÓRIO]   [🏆 TORNEIOS]   [🛒 LOJA] │
│                                                     │
│  💬 CHAT GLOBAL                                     │
│  ┌─────────────────────────────────────┐           │
│  │ Player1: Alguém quer duelar?        │           │
│  │ Player2: Bora!                      │           │
│  └─────────────────────────────────────┘           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 🃏 Deck Builder
```
┌─────────────────────────────────────────────────────┐
│  🃏 Construtor de Decks                [Voltar]     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  DECK ATUAL (20/40)          INVENTÁRIO             │
│  ┌──────────────┐            ┌──────────────┐      │
│  │  [Carta 1]   │            │  [Carta X]   │      │
│  │  [Carta 2]   │            │  [Carta Y]   │      │
│  │  [Carta 3]   │            │  [Carta Z]   │      │
│  │     ...      │            │     ...      │      │
│  └──────────────┘            └──────────────┘      │
│                                                     │
│  Monstros: 10    [Salvar Deck]                     │
│  Magias: 7       [Importar Código]                 │
│  Armadilhas: 3                                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### ⚔️ Arena de Duelo
```
┌─────────────────────────────────────────────────────┐
│  ⚔️ DUELO                            LP: 8000 / 8000│
├─────────────────────────────────────────────────────┤
│                                                     │
│  OPONENTE                                          │
│  ┌───────────────────────────────────────┐         │
│  │  [?] [?] [?] [?] [?]  (Mão: 5 cartas) │         │
│  │                                       │         │
│  │  Campo: [Carta Virada] [Monstro ATK] │         │
│  └───────────────────────────────────────┘         │
│                                                     │
│  CAMPO DE BATALHA                                  │
│  ┌───────────────────────────────────────┐         │
│  │  [Armadilha] [Campo] [Magia]          │         │
│  └───────────────────────────────────────┘         │
│                                                     │
│  VOCÊ                                              │
│  ┌───────────────────────────────────────┐         │
│  │  Campo: [Monstro DEF] [Armadilha Set] │         │
│  │                                       │         │
│  │  Mão: [🃏][🃏][🃏][🃏][🃏][🃏]        │         │
│  └───────────────────────────────────────┘         │
│                                                     │
│  [⚔️ Atacar] [🛡️ Defender] [✨ Magia] [🎯 Fim]   │
│                                                     │
│  💬 Chat: Oponente: Boa sorte!                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 🛡️ Painel Admin
```
┌─────────────────────────────────────────────────────┐
│  🛡️ Painel Administrativo              [Admin]      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [👥 Usuários] [🃏 Cartas] [🏆 Torneios] [📰 News]│
│                                                     │
│  📊 ESTATÍSTICAS                                   │
│  ┌─────────────────────────────────────────┐       │
│  │ Total Usuários: 1,234                   │       │
│  │ Online Agora: 56                        │       │
│  │ Duelos Hoje: 342                        │       │
│  │ Torneios Ativos: 3                      │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
│  👥 USUÁRIOS ONLINE                                │
│  ┌─────────────────────────────────────────┐       │
│  │ Player1    Rating: 2100  [Ban] [Promote]│       │
│  │ Player2    Rating: 1850  [Ban] [Promote]│       │
│  │ Player3    Rating: 1600  [Ban] [Promote]│       │
│  └─────────────────────────────────────────┘       │
│                                                     │
│  [+ Criar Notícia] [+ Adicionar Carta]             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 🎮 Comandos Rápidos

### Desenvolvimento Local
```bash
# Iniciar tudo
docker-compose up -d

# Ver logs
docker-compose logs -f

# Parar tudo
docker-compose down

# Reconstruir imagens
docker-compose up -d --build
```

### Deploy Vercel
```bash
cd frontend
vercel login
vercel --prod
```

### Deploy Railway
```bash
# Via GitHub (recomendado)
1. Push para GitHub
2. Connect no Railway
3. Add databases
4. Configure env vars

# Via CLI
npm install -g @railway/cli
railway login
railway link
railway up
```

---

## 🔧 Troubleshooting

### ❌ Erro: "Cannot connect to database"
```bash
# Reinicie os containers
docker-compose restart postgres mongodb redis
```

### ❌ Erro: "Port already in use"
```bash
# Mude as portas no docker-compose.yml
ports:
  - "3001:3000"  # Backend
  - "5174:5173"  # Frontend
```

### ❌ Frontend não conecta ao backend
```bash
# Verifique VITE_API_URL no frontend/.env
VITE_API_URL=http://localhost:3000
```

### ❌ WebSocket não funciona
```bash
# Verifique CORS no backend/.env
CORS_ORIGIN=http://localhost:5173
```

---

## 📞 Suporte

- **Bugs**: Abra uma [Issue](https://github.com/Matheusoliveira2397/Yugioh/issues)
- **Dúvidas**: Consulte a [Documentação](./DEPLOY_GUIDE.md)
- **Contribuições**: Abra um [Pull Request](https://github.com/Matheusoliveira2397/Yugioh/pulls)

---

<div align="center">

**🎮 Bom jogo e que o Coração das Cartas esteja com você! 🌟**

</div>
