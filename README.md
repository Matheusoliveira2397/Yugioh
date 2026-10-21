# 🎮 Yu-Gi-Oh! Online - Jogo de Cartas Multiplayer

<div align="center">

![Yu-Gi-Oh](https://img.shields.io/badge/Yu--Gi--Oh!-Online-purple?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-blue?style=for-the-badge&logo=react)
![NestJS](https://img.shields.io/badge/NestJS-10-red?style=for-the-badge&logo=nestjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-green?style=for-the-badge)

**Jogo de cartas Yu-Gi-Oh! online com duelos em tempo real, sistema de clãs, torneios e muito mais!**

[🚀 Deploy](#-deploy) | [📦 Instalação](#-instalação-local) | [🎯 Funcionalidades](#-funcionalidades) | [📚 Documentação](#-documentação)

</div>

---

## 🎯 Funcionalidades

### 🏠 Sistema Completo
- ✅ **Sistema de Autenticação** - Registro, login, verificação de email
- ✅ **Perfis de Usuário** - Avatar, estatísticas, histórico
- ✅ **Sistema de Economia** - Gemas, moedas, créditos

### ⚔️ Duelos e Matchmaking
- ✅ **Duelos em Tempo Real** - WebSocket com mecânicas Yu-Gi-Oh!
- ✅ **Random Duel** - Matchmaking automático por nível
- ✅ **Arena de Desafios** - Eventos de 2h com recompensas extras
- ✅ **Sistema de Turnos** - Mecânicas completas do jogo

### 🏆 Competições
- ✅ **Sistema de Torneios** - Brackets automáticos, premiações
- ✅ **Seasons** - Rankings temporais com divisões
- ✅ **Ranking Global** - Top jogadores e clãs
- ✅ **Sistema de Clãs** - Grupos com ranking semanal/mensal

### 🃏 Cartas e Decks
- ✅ **Deck Builder** - Construtor visual de decks
- ✅ **Loja de Cartas** - Compra com gemas/moedas
- ✅ **Sistema de Inventário** - Gestão de coleção
- ✅ **Importação de Decks** - Via código

### 💬 Social
- ✅ **Chat Global** - Comunicação em tempo real
- ✅ **Sistema de Amigos** - Adicionar, remover, chat privado
- ✅ **Mensagens Privadas** - Sistema de mail interno
- ✅ **Feed de Notícias** - Atualizações e eventos

### 🛡️ Administração
- ✅ **Painel Admin Completo** - Gestão de usuários, cartas, torneios
- ✅ **Sistema de Ban/Unban** - Moderação com histórico de IPs
- ✅ **Criação de Notícias** - Sistema de postagens
- ✅ **Gestão de Cartas** - CRUD completo com upload de imagens

---

## 🚀 Deploy

### **Opção 1: Deploy em Produção (Recomendado)**

#### Frontend no Vercel (Grátis)
```bash
cd frontend
npm install -g vercel
vercel login
vercel --prod
```

#### Backend no Railway (Grátis $5/mês)
1. Acesse: https://railway.app
2. Login com GitHub
3. New Project → Deploy from GitHub
4. Selecione o repositório `Yugioh`
5. Adicione PostgreSQL, MongoDB e Redis
6. Configure as variáveis de ambiente

**📖 Guia completo:** Veja [DEPLOY_QUICKSTART.md](./DEPLOY_QUICKSTART.md)

---

## 📦 Instalação Local

### Pré-requisitos
- Node.js 20+
- Docker Desktop
- Git

### 1. Clone o repositório
```bash
git clone https://github.com/Matheusoliveira2397/Yugioh.git
cd Yugioh
```

### 2. Dev leve (recomendado no Windows)

Evita Vite/Nginx/Adminer dentro do Docker (polling + RAM alta).

O frontend do jogo precisa de **Node 20**, mas os scripts **não alteram** o Node padrão do sistema
(ex.: se você usa Node 16 em outro serviço, continue com `nvm use 16.10.0`).

```powershell
# Uma vez: ter o 20 instalado no nvm (sem trocar o padrão)
nvm install 20.11.0
# manter o padrão do PC no 16:
nvm use 16.10.0

# subir o jogo (usa Node 20 só pelo caminho absoluto)
.\scripts\dev-lite.ps1
# ou só o frontend:
.\scripts\frontend-dev.ps1
```

Stack completa no Docker (mais pesada; Node 20 só dentro do container):
```bash
docker compose --profile docker-ui up -d
```

Serviços lite:
- ✅ Backend → http://localhost:3000
- ✅ Frontend (host) → http://localhost:5173
- ✅ PostgreSQL / MongoDB / Redis

### 3. Acesse o jogo
Abra seu navegador em: **http://localhost:5173**

### 4. Criar conta Admin (opcional)
```bash
# Conecte ao PostgreSQL
docker exec -it yugioh-postgres psql -U yugioh_user -d yugioh_db

# Execute
UPDATE users SET role = 'MASTER' WHERE email = 'seu-email@exemplo.com';
```

---

## 🛠️ Tecnologias

### Frontend
- **React 18** - Framework UI
- **TypeScript** - Tipagem estática
- **Vite** - Build tool
- **TailwindCSS** - Estilização
- **Framer Motion** - Animações
- **Zustand** - Gerenciamento de estado
- **Socket.io Client** - WebSocket

### Backend
- **NestJS 10** - Framework Node.js
- **TypeScript** - Tipagem estática
- **TypeORM** - ORM para PostgreSQL
- **Mongoose** - ODM para MongoDB
- **Socket.io** - WebSocket
- **JWT** - Autenticação
- **Redis** - Cache e sessões
- **Nodemailer** - Envio de emails

### Bancos de Dados
- **PostgreSQL** - Dados principais (usuários, decks, duelos)
- **MongoDB** - Chat e logs
- **Redis** - Cache e sessões em tempo real

### DevOps
- **Docker** - Containerização
- **Docker Compose** - Orquestração
- **GitHub Actions** - CI/CD (em desenvolvimento)

---

## 📁 Estrutura do Projeto

```
Yugioh/
├── backend/                 # API NestJS
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/       # Autenticação
│   │   │   ├── users/      # Usuários
│   │   │   ├── cards/      # Cartas
│   │   │   ├── decks/      # Decks
│   │   │   ├── duel/       # Lógica de duelos
│   │   │   ├── matchmaking/ # Sistema de matchmaking
│   │   │   ├── tournaments/ # Torneios
│   │   │   ├── groups/     # Clãs
│   │   │   ├── chat/       # Chat
│   │   │   ├── shop/       # Loja
│   │   │   ├── seasons/    # Seasons
│   │   │   ├── arena/      # Arena de desafios
│   │   │   ├── news/       # Notícias
│   │   │   └── admin/      # Administração
│   │   └── main.ts
│   └── Dockerfile
├── frontend/               # App React
│   ├── src/
│   │   ├── pages/         # Páginas
│   │   ├── components/    # Componentes
│   │   ├── stores/        # Estados globais
│   │   └── hooks/         # Custom hooks
│   └── Dockerfile
├── docker-compose.yml     # Orquestração
└── README.md
```

---

## 📚 Documentação

- [🚀 Deploy Rápido](./DEPLOY_QUICKSTART.md)
- [📖 Guia Completo de Deploy](./DEPLOY_GUIDE.md)
- [🃏 Sistema de Cartas](./CARD_SYSTEM_GUIDE.md)
- [💾 Banco de Dados](./DATABASE_GUIDE.md)
- [🎮 Mecânicas do Jogo](./GAME_MECHANICS.md)
- [🏆 Sistema de Torneios](./TOURNAMENTS_GUIDE.md)
- [👥 Sistema de Grupos](./GROUPS_FEATURE.md)

---

## 🎮 Como Jogar

1. **Registre-se** no jogo
2. **Crie seu deck** no Deck Builder
3. **Compre cartas** na loja usando gemas
4. **Entre em duelos** via Random Duel ou Arena
5. **Participe de torneios** para ganhar prêmios
6. **Crie ou entre em um clã** para competir em grupo

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Adicionada nova feature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

---

## 📝 Licença

Este projeto é apenas para fins educacionais. Yu-Gi-Oh! é marca registrada da Konami.

---

## 👨‍💻 Autor

**Matheus Oliveira**
- GitHub: [@Matheusoliveira2397](https://github.com/Matheusoliveira2397)
- Projeto: [Yu-Gi-Oh! Online](https://github.com/Matheusoliveira2397/Yugioh)

---

## 🌟 Roadmap

- [ ] Sistema de replay de duelos
- [ ] Mobile app (React Native)
- [ ] Mais mecânicas avançadas (XYZ, Link, Pendulum)
- [ ] Sistema de eventos especiais
- [ ] Marketplace de cartas entre jogadores
- [ ] Sistema de conquistas/badges
- [ ] Modo espectador para duelos
- [ ] Ranking por região

---

<div align="center">

**⭐ Se você gostou do projeto, deixe uma estrela!**

Made with ❤️ by Matheus Oliveira

</div>
