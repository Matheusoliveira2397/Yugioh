# 📚 Índice de Documentação - Yu-Gi-Oh! Online

## 🎯 Comece por aqui!

Escolha o guia de acordo com sua necessidade:

### 🚀 Quero fazer o deploy RÁPIDO (5 minutos)
👉 **[DEPLOY_QUICKSTART.md](./DEPLOY_QUICKSTART.md)**
- Guia direto ao ponto
- Passo a passo resumido
- Ideal para quem já tem experiência

### 📖 Quero entender TODO o processo
👉 **[DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md)**
- Guia completo e detalhado
- 3 opções de deploy explicadas
- Comparação de custos
- Troubleshooting extensivo

### ✅ Acabei de fazer deploy, como valido?
👉 **[POST_DEPLOY_GUIDE.md](./POST_DEPLOY_GUIDE.md)**
- Checklist de validação completo
- Testes de funcionalidades
- Configuração de primeiro admin
- Monitoramento e logs

### ⚡ Preciso de comandos rápidos
👉 **[CHEAT_SHEET.md](./CHEAT_SHEET.md)**
- Comandos Git, Docker, Vercel, Railway
- Troubleshooting rápido
- URLs úteis
- Atalhos

### 📋 Quero ver referência de scripts
👉 **[DEPLOY_SCRIPTS.md](./DEPLOY_SCRIPTS.md)**
- Scripts de deploy detalhados
- Comandos de redeploy
- Rollback
- Script all-in-one

### 🎨 Quero ver visualmente o projeto
👉 **[QUICK_GUIDE.md](./QUICK_GUIDE.md)**
- Diagramas de arquitetura
- Mockups de telas
- Fluxos de funcionalidades
- Comandos essenciais

### 📦 Quero saber todos os arquivos criados
👉 **[DEPLOY_SUMMARY.md](./DEPLOY_SUMMARY.md)**
- Lista completa de arquivos
- Propósito de cada arquivo
- Estrutura do projeto
- Ordem recomendada de uso

---

## 🗂️ Documentação por Categoria

### 🎮 Sobre o Jogo
- **[README.md](./README.md)** - Documentação principal do projeto
- **[GAME_MECHANICS.md](./GAME_MECHANICS.md)** - Mecânicas de jogo
- **[CARD_SYSTEM_GUIDE.md](./CARD_SYSTEM_GUIDE.md)** - Sistema de cartas

### 🃏 Sistema de Cartas
- **[CARD_CREATION_GUIDE.md](./CARD_CREATION_GUIDE.md)** - Como criar cartas
- **[CARD_CREATION_TIPS.md](./CARD_CREATION_TIPS.md)** - Dicas de criação
- **[CARD_REGISTRATION_SYSTEM.md](./CARD_REGISTRATION_SYSTEM.md)** - Sistema de registro
- **[ADMIN_CARDS_PANEL_GUIDE.md](./ADMIN_CARDS_PANEL_GUIDE.md)** - Painel admin de cartas

### 🏆 Sistemas do Jogo
- **[TOURNAMENTS_GUIDE.md](./TOURNAMENTS_GUIDE.md)** - Sistema de torneios
- **[GROUPS_FEATURE.md](./GROUPS_FEATURE.md)** - Sistema de clãs
- **[PURCHASE_SYSTEM_COMPLETE_GUIDE.md](./PURCHASE_SYSTEM_COMPLETE_GUIDE.md)** - Sistema de compras
- **[SISTEMA_AVATARES.md](./SISTEMA_AVATARES.md)** - Sistema de avatares

### 🛠️ Técnico
- **[DATABASE_GUIDE.md](./DATABASE_GUIDE.md)** - Estrutura do banco de dados
- **[WEBSOCKET_PRODUCTION_GUIDE.md](./WEBSOCKET_PRODUCTION_GUIDE.md)** - WebSocket em produção
- **[PERFORMANCE_GUIDE.md](./PERFORMANCE_GUIDE.md)** - Otimização de performance

### ⚙️ Configuração
- **[SETUP.md](./SETUP.md)** - Setup inicial
- **[GUIA_EMAIL.md](./GUIA_EMAIL.md)** - Configuração de email
- **[IMPLEMENTATION_COMPLETE.md](./IMPLEMENTATION_COMPLETE.md)** - Status de implementação

### 🚀 Deploy
- **[DEPLOY_QUICKSTART.md](./DEPLOY_QUICKSTART.md)** ⭐ Início rápido
- **[DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md)** ⭐ Guia completo
- **[POST_DEPLOY_GUIDE.md](./POST_DEPLOY_GUIDE.md)** ⭐ Validação
- **[DEPLOY_SCRIPTS.md](./DEPLOY_SCRIPTS.md)** ⭐ Scripts
- **[DEPLOY_SUMMARY.md](./DEPLOY_SUMMARY.md)** ⭐ Sumário
- **[CHEAT_SHEET.md](./CHEAT_SHEET.md)** ⭐ Comandos rápidos
- **[QUICK_GUIDE.md](./QUICK_GUIDE.md)** ⭐ Guia visual

---

## 🔧 Scripts Disponíveis

### Windows (PowerShell)
```powershell
# Iniciar desenvolvimento local
.\start.ps1

# Parar serviços
.\stop.ps1

# Ver logs
.\logs.ps1

# Preparar para produção
.\prepare-production.ps1

# Deploy automatizado completo
.\deploy-all.ps1
```

### Linux/Mac (Bash)
```bash
# Preparar para produção
chmod +x prepare-production.sh
./prepare-production.sh

# Iniciar com Docker
docker-compose up -d

# Parar
docker-compose down
```

---

## 📊 Arquivos de Configuração

### Frontend
- `frontend/vercel.json` - Configuração do Vercel
- `frontend/.vercelignore` - Arquivos ignorados no deploy
- `frontend/.env.example` - Template de variáveis de ambiente

### Backend
- `railway.json` - Configuração do Railway
- `backend/.env.example` - Template de variáveis de ambiente
- `backend/Dockerfile` - Imagem Docker

### Raiz
- `docker-compose.yml` - Orquestração Docker
- `.gitignore` - Arquivos ignorados no Git

---

## 🎓 Tutoriais Passo a Passo

### 1️⃣ Primeira Vez (Desenvolvimento Local)
1. Leia: [SETUP.md](./SETUP.md)
2. Execute: `docker-compose up -d`
3. Acesse: http://localhost:5173

### 2️⃣ Primeira Vez (Deploy em Produção)
1. Leia: [DEPLOY_QUICKSTART.md](./DEPLOY_QUICKSTART.md)
2. Execute: `.\prepare-production.ps1`
3. Execute: `.\deploy-all.ps1`
4. Siga as instruções na tela
5. Valide: [POST_DEPLOY_GUIDE.md](./POST_DEPLOY_GUIDE.md)

### 3️⃣ Criar Novas Cartas
1. Leia: [CARD_CREATION_GUIDE.md](./CARD_CREATION_GUIDE.md)
2. Acesse o Admin Panel
3. Vá em "Cartas" → "Nova Carta"
4. Preencha e salve

### 4️⃣ Criar Torneio
1. Leia: [TOURNAMENTS_GUIDE.md](./TOURNAMENTS_GUIDE.md)
2. Admin Panel → "Torneios"
3. Configure e crie
4. Inicie quando tiver jogadores suficientes

### 5️⃣ Configurar Email
1. Leia: [GUIA_EMAIL.md](./GUIA_EMAIL.md)
2. Gere senha de aplicativo no Gmail
3. Configure `MAIL_*` no `.env`
4. Teste enviando email de verificação

---

## 🆘 Troubleshooting

### Problema com...

#### Docker
📖 [QUICK_GUIDE.md](./QUICK_GUIDE.md) → Seção "Troubleshooting"

#### Deploy
📖 [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) → Seção "Troubleshooting"

#### WebSocket
📖 [WEBSOCKET_PRODUCTION_GUIDE.md](./WEBSOCKET_PRODUCTION_GUIDE.md)

#### Performance
📖 [PERFORMANCE_GUIDE.md](./PERFORMANCE_GUIDE.md)

#### Database
📖 [DATABASE_GUIDE.md](./DATABASE_GUIDE.md)

#### Comandos rápidos
📖 [CHEAT_SHEET.md](./CHEAT_SHEET.md)

---

## 🔗 Links Úteis

### Projeto
- **GitHub**: https://github.com/Matheusoliveira2397/Yugioh
- **Issues**: https://github.com/Matheusoliveira2397/Yugioh/issues
- **Pull Requests**: https://github.com/Matheusoliveira2397/Yugioh/pulls

### Hosting (Exemplos)
- **Frontend Vercel**: https://seu-app.vercel.app
- **Backend Railway**: https://seu-backend.railway.app

### Dashboards
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Railway Dashboard**: https://railway.app/dashboard

### Documentação Externa
- **Vercel Docs**: https://vercel.com/docs
- **Railway Docs**: https://docs.railway.app
- **NestJS Docs**: https://docs.nestjs.com
- **React Docs**: https://react.dev
- **Docker Docs**: https://docs.docker.com

---

## 📱 Contato e Suporte

### Reportar Bug
Abra uma issue: https://github.com/Matheusoliveira2397/Yugioh/issues/new

### Sugerir Feature
Abra uma discussão: https://github.com/Matheusoliveira2397/Yugioh/discussions

### Contribuir
Leia o README e abra um Pull Request

---

## 🎯 Mapa Mental

```
📚 Documentação
├── 🚀 Deploy
│   ├── DEPLOY_QUICKSTART.md (5 min)
│   ├── DEPLOY_GUIDE.md (completo)
│   ├── POST_DEPLOY_GUIDE.md (validação)
│   ├── DEPLOY_SCRIPTS.md (comandos)
│   ├── DEPLOY_SUMMARY.md (arquivos)
│   ├── CHEAT_SHEET.md (referência)
│   └── QUICK_GUIDE.md (visual)
│
├── 🃏 Cartas
│   ├── CARD_CREATION_GUIDE.md
│   ├── CARD_CREATION_TIPS.md
│   ├── CARD_REGISTRATION_SYSTEM.md
│   ├── CARD_SYSTEM_GUIDE.md
│   └── ADMIN_CARDS_PANEL_GUIDE.md
│
├── 🎮 Jogo
│   ├── README.md
│   ├── GAME_MECHANICS.md
│   ├── TOURNAMENTS_GUIDE.md
│   ├── GROUPS_FEATURE.md
│   └── PURCHASE_SYSTEM_COMPLETE_GUIDE.md
│
└── 🛠️ Técnico
    ├── SETUP.md
    ├── DATABASE_GUIDE.md
    ├── WEBSOCKET_PRODUCTION_GUIDE.md
    ├── PERFORMANCE_GUIDE.md
    └── GUIA_EMAIL.md
```

---

## 🏁 Checklist de Novos Desenvolvedores

Está começando agora? Siga esta ordem:

- [ ] 1. Leia o [README.md](./README.md) (visão geral)
- [ ] 2. Siga o [SETUP.md](./SETUP.md) (ambiente local)
- [ ] 3. Execute `docker-compose up -d`
- [ ] 4. Acesse http://localhost:5173 e teste
- [ ] 5. Leia [QUICK_GUIDE.md](./QUICK_GUIDE.md) (arquitetura)
- [ ] 6. Explore o código em `backend/src/` e `frontend/src/`
- [ ] 7. Quando pronto para deploy: [DEPLOY_QUICKSTART.md](./DEPLOY_QUICKSTART.md)

---

## 🎉 Conclusão

Este projeto tem **25+ documentos** cobrindo todos os aspectos do desenvolvimento e deploy.

**Não sabe por onde começar?**
- 🆕 Novo no projeto → [README.md](./README.md)
- 💻 Quer rodar local → [SETUP.md](./SETUP.md)
- 🚀 Quer fazer deploy → [DEPLOY_QUICKSTART.md](./DEPLOY_QUICKSTART.md)
- ⚡ Precisa de ajuda rápida → [CHEAT_SHEET.md](./CHEAT_SHEET.md)

---

<div align="center">

**📖 Toda documentação está sempre atualizada!**

Made with ❤️ by Matheus Oliveira

[⭐ Star no GitHub](https://github.com/Matheusoliveira2397/Yugioh) | [🐛 Report Bug](https://github.com/Matheusoliveira2397/Yugioh/issues) | [💡 Request Feature](https://github.com/Matheusoliveira2397/Yugioh/discussions)

</div>
