# Yu-Gi-Oh! Online - Jogo de Duelo para Navegador 🎮

Um jogo de Yu-Gi-Oh! multiplayer online escalável, desenvolvido com tecnologias modernas para suportar milhares de jogadores simultâneos.

## 🚀 Tecnologias Utilizadas

### Backend
- **Node.js 20** - Runtime JavaScript
- **NestJS** - Framework backend escalável e modular
- **TypeScript** - Type safety e melhor DX
- **Socket.IO** - Comunicação real-time para duelos
- **PostgreSQL 16** - Banco de dados relacional (usuários, decks, torneios)
- **MongoDB 7** - Banco NoSQL (chat, logs de partidas)
- **Redis 7** - Cache, sessões e matchmaking

### Frontend
- **React 18** - Biblioteca UI
- **TypeScript** - Type safety
- **Vite** - Build tool ultra-rápido
- **TailwindCSS** - Framework CSS utility-first
- **Zustand** - State management leve
- **Socket.IO Client** - Comunicação real-time
- **Framer Motion** - Animações suaves

### Infraestrutura
- **Docker & Docker Compose** - Containerização
- **Nginx** - Load balancer e proxy reverso

## 📋 Pré-requisitos

- **Docker Desktop** instalado
- **Docker Compose** instalado

## 🎯 Funcionalidades

- ✅ Sistema de autenticação (registro e login)
- ✅ Matchmaking automático baseado em rating
- ✅ Duelos em tempo real via WebSocket
- ✅ Sistema de chat global e privado
- ✅ Construtor de decks
- ✅ Sistema de torneios
- ✅ Sistema de ranking
- ✅ Desafios entre jogadores via chat

## 🛠️ Instalação e Execução

### 1. Clone o repositório (se aplicável)

```powershell
git clone <seu-repositorio>
cd Yugioh
```

### 2. Configure as variáveis de ambiente

#### Backend
```powershell
Copy-Item backend\.env.example backend\.env
```

#### Frontend
```powershell
Copy-Item frontend\.env.example frontend\.env
```

### 3. Inicie todos os serviços com Docker Compose

```powershell
docker-compose up --build
```

Isso irá iniciar:
- ✅ PostgreSQL (porta 5432)
- ✅ MongoDB (porta 27017)
- ✅ Redis (porta 6379)
- ✅ Backend API (porta 3000)
- ✅ Frontend React (porta 5173)
- ✅ Nginx Load Balancer (porta 80)

### 4. Acesse a aplicação

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Nginx (Production-like)**: http://localhost

## 📁 Estrutura do Projeto

```
Yugioh/
├── backend/                  # Backend NestJS
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/        # Autenticação JWT
│   │   │   ├── users/       # Gerenciamento de usuários
│   │   │   ├── cards/       # Sistema de cartas
│   │   │   ├── decks/       # Construtor de decks
│   │   │   ├── duel/        # Lógica de duelos (WebSocket)
│   │   │   ├── matchmaking/ # Sistema de matchmaking
│   │   │   ├── tournament/  # Sistema de torneios
│   │   │   ├── chat/        # Chat real-time
│   │   │   └── redis/       # Integração Redis
│   │   ├── main.ts
│   │   └── app.module.ts
│   ├── Dockerfile
│   └── package.json
│
├── frontend/                 # Frontend React
│   ├── src/
│   │   ├── components/      # Componentes reutilizáveis
│   │   ├── pages/           # Páginas da aplicação
│   │   ├── stores/          # Zustand stores
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   └── package.json
│
├── nginx/                    # Configuração Nginx
│   └── nginx.conf
│
└── docker-compose.yml        # Orquestração de containers
```

## 🎮 Como Jogar

1. **Registre-se**: Crie uma conta com usuário, email e senha
2. **Construa seu deck**: Acesse o Deck Builder e monte seu deck (40-60 cartas)
3. **Encontre uma partida**: 
   - Clique em "Partida Rápida" para matchmaking automático
   - Ou desafie um jogador específico pelo chat
4. **Duelar**: Jogue cartas, ataque e vença seu oponente!
5. **Torneios**: Participe de torneios para ganhar recompensas

## 🔧 Scripts Úteis

### Parar todos os containers
```powershell
docker-compose down
```

### Ver logs
```powershell
# Todos os serviços
docker-compose logs -f

# Apenas backend
docker-compose logs -f backend

# Apenas frontend
docker-compose logs -f frontend
```

### Rebuild de um serviço específico
```powershell
docker-compose up --build backend
```

### Limpar volumes e reconstruir
```powershell
docker-compose down -v
docker-compose up --build
```

## 🗄️ Banco de Dados

### PostgreSQL
- **Usuário**: yugioh_user
- **Senha**: yugioh_password_2024
- **Database**: yugioh_db
- **Porta**: 5432

### MongoDB
- **Usuário**: yugioh_mongo
- **Senha**: yugioh_mongo_password
- **Database**: yugioh_chat
- **Porta**: 27017

### Redis
- **Porta**: 6379
- **Max Memory**: 512MB
- **Policy**: allkeys-lru

## 📊 Escalabilidade

A arquitetura foi projetada para ser escalável:

1. **Backend**: Stateless, pode escalar horizontalmente
2. **Redis**: Gerencia sessões e matchmaking em memória
3. **PostgreSQL**: Otimizado com índices e relações eficientes
4. **MongoDB**: Ideal para logs e dados não-estruturados
5. **WebSocket**: Comunicação eficiente e em tempo real
6. **Nginx**: Load balancer pronto para múltiplas instâncias

## 🔐 Segurança

- JWT para autenticação
- Senhas hasheadas com bcrypt
- Validação de dados com class-validator
- CORS configurado
- Variáveis de ambiente para secrets

## 🚧 Desenvolvimento Futuro

- [ ] Implementar lógica completa de cartas do Yu-Gi-Oh!
- [ ] Adicionar IA para duelos single-player
- [ ] Sistema de conquistas e recompensas
- [ ] Marketplace de cartas
- [ ] Sistema de amizades
- [ ] Replays de partidas
- [ ] Modo espectador
- [ ] Rankings e leaderboards globais
- [ ] Eventos especiais sazonais

## 📝 Notas Importantes

⚠️ **Este projeto é apenas para fins educacionais**. Yu-Gi-Oh! é uma marca registrada da Konami. Todas as cartas, nomes e conceitos de jogo são propriedade da Konami Digital Entertainment.

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou pull requests.

## 📄 Licença

Este projeto é open source e está disponível sob a licença MIT.

---

Desenvolvido com ❤️ para a comunidade de Yu-Gi-Oh!
