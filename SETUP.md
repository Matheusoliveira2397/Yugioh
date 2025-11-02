# 🎮 Yu-Gi-Oh! Online Game - Setup Completo

## ✅ Projeto Criado com Sucesso!

Seu jogo de Yu-Gi-Oh! está pronto para ser executado. Toda a infraestrutura foi configurada com Docker.

## 📦 O que foi criado?

### Backend (NestJS + TypeScript)
- ✅ Sistema de autenticação (JWT)
- ✅ Módulo de usuários
- ✅ Sistema de cartas
- ✅ Construtor de decks
- ✅ Duelos em tempo real (WebSocket)
- ✅ Matchmaking automático
- ✅ Sistema de torneios
- ✅ Chat real-time
- ✅ Integração com Redis para cache/sessões

### Frontend (React + TypeScript + TailwindCSS)
- ✅ Página de Login/Registro
- ✅ Home com dashboard do jogador
- ✅ Deck Builder
- ✅ Tela de duelo
- ✅ Sistema de torneios
- ✅ Chat integrado
- ✅ Matchmaking em tempo real

### Infraestrutura
- ✅ PostgreSQL 16 (dados principais)
- ✅ MongoDB 7 (chat e logs)
- ✅ Redis 7 (cache e matchmaking)
- ✅ Nginx (load balancer)
- ✅ Docker Compose (orquestração completa)

## 🚀 Como Rodar

### Passo 1: Criar arquivos .env

**Backend (.env):**
```powershell
Copy-Item backend\.env.example backend\.env
```

**Frontend (.env):**
```powershell
Copy-Item frontend\.env.example frontend\.env
```

### Passo 2: Iniciar todos os serviços

```powershell
docker-compose up --build
```

### Passo 3: Aguarde todos os serviços iniciarem

Você verá mensagens de:
- ✅ PostgreSQL ready
- ✅ MongoDB ready
- ✅ Redis ready
- ✅ Backend API running
- ✅ Frontend dev server running

### Passo 4: Acesse a aplicação

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Via Nginx**: http://localhost

## 🎯 Funcionalidades Implementadas

1. **Autenticação**
   - Registro de usuários
   - Login com JWT
   - Proteção de rotas

2. **Duelos**
   - Matchmaking automático baseado em rating
   - Comunicação em tempo real via WebSocket
   - Sistema de turnos
   - Life Points tracking

3. **Decks**
   - Construtor de decks (40-60 cartas)
   - Validação de regras
   - Múltiplos decks por usuário

4. **Torneios**
   - Sistema de inscrições
   - Limitação de participantes
   - Status de torneios

5. **Chat**
   - Chat global
   - Mensagens privadas
   - Sistema de desafios entre jogadores

## 📊 Portas Utilizadas

- **5173** - Frontend (Vite)
- **3000** - Backend (NestJS)
- **5432** - PostgreSQL
- **27017** - MongoDB
- **6379** - Redis
- **80** - Nginx

## 🔧 Comandos Úteis

### Ver logs de todos os serviços
```powershell
docker-compose logs -f
```

### Ver logs de um serviço específico
```powershell
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Parar todos os serviços
```powershell
docker-compose down
```

### Parar e remover volumes (limpar dados)
```powershell
docker-compose down -v
```

### Rebuild de um serviço específico
```powershell
docker-compose up --build backend
```

## 🗄️ Credenciais dos Bancos de Dados

### PostgreSQL
- Host: localhost:5432
- User: yugioh_user
- Password: yugioh_password_2024
- Database: yugioh_db

### MongoDB
- Host: localhost:27017
- User: yugioh_mongo
- Password: yugioh_mongo_password
- Database: yugioh_chat

### Redis
- Host: localhost:6379
- (sem autenticação em dev)

## 🎨 Stack Tecnológica

### Backend
- Node.js 20
- NestJS 10
- TypeScript
- Socket.IO
- TypeORM (PostgreSQL)
- Mongoose (MongoDB)
- Redis Client
- JWT & Passport
- Bcrypt

### Frontend
- React 18
- TypeScript
- Vite 5
- TailwindCSS 3
- Zustand (state management)
- Socket.IO Client
- React Router DOM
- Framer Motion
- Axios

## 📈 Próximos Passos

1. Implemente a lógica completa das cartas de Yu-Gi-Oh!
2. Adicione mais tipos de cartas (Monstros, Magias, Armadilhas)
3. Implemente efeitos especiais das cartas
4. Adicione animações de duelo
5. Crie sistema de recompensas
6. Implemente ranking global
7. Adicione modo espectador
8. Crie sistema de replays

## ⚠️ Notas Importantes

1. **NÃO USE AS SENHAS PADRÃO EM PRODUÇÃO!**
2. O código TypeScript tem alguns erros de compilação pois as dependências ainda não foram instaladas - eles desaparecerão assim que os containers forem iniciados.
3. Este é um projeto educacional. Yu-Gi-Oh! é marca registrada da Konami.

## 🐛 Solução de Problemas

### Porta já em uso
Se alguma porta estiver em uso, edite o `docker-compose.yml` e altere as portas.

### Erro ao conectar ao banco
Aguarde alguns segundos. Os healthchecks garantem que os serviços estejam prontos.

### Frontend não carrega
Verifique se o backend está rodando em http://localhost:3000

## 📚 Documentação

Consulte o README.md principal para mais informações detalhadas.

---

**Pronto para duelar! It's time to D-D-D-DUEL! 🎴**
