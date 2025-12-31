# Passo a Passo - Configuração Completa

## 📋 Passo 1: Criar Arquivos de Configuração

### Backend

1. Vá para a pasta `backend`:
```bash
cd backend
```

2. Crie o arquivo `.env` (desenvolvimento):
```bash
# Windows PowerShell
New-Item -Path ".env" -ItemType File

# Linux/Mac
touch .env
```

3. Abra o arquivo `.env` e cole este conteúdo:

```env
PORT=3000
NODE_ENV=development

# CORS - URL do frontend local
CORS_ORIGIN=http://localhost:5173

# Banco de Dados PostgreSQL
# ⚠️ SUBSTITUA pelos seus dados reais!
DATABASE_URL=postgresql://usuario:senha@localhost:5432/yugioh

# MongoDB (Opcional - deixe vazio se não usar)
MONGODB_URI=mongodb://localhost:27017/yugioh-chat

# Redis (Opcional - deixe vazio se não usar)
REDIS_URL=redis://localhost:6379

# JWT - GERE UMA CHAVE ÚNICA!
# Execute: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=COLE_AQUI_A_CHAVE_GERADA
JWT_EXPIRES_IN=7d

# Upload
MAX_FILE_SIZE=10485760

# Configurações
HTTP_TIMEOUT=30000
MAX_CONNECTIONS=2000
LOG_LEVEL=info
```

### Frontend

1. Vá para a pasta `frontend`:
```bash
cd frontend
```

2. Crie o arquivo `.env.local` (desenvolvimento):
```bash
# Windows PowerShell
New-Item -Path ".env.local" -ItemType File

# Linux/Mac
touch .env.local
```

3. Abra o arquivo `.env.local` e cole este conteúdo:

```env
# URL da API do backend (desenvolvimento local)
VITE_API_URL=http://localhost:3000

# WebSocket (opcional - deixa vazio para usar VITE_API_URL)
VITE_WS_URL=
```

## 🔑 Passo 2: Gerar Chave JWT

Execute este comando para gerar uma chave JWT segura:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copie o resultado e cole no campo `JWT_SECRET` do arquivo `backend/.env`.

## 🗄️ Passo 3: Configurar Banco de Dados

### Se você já tem PostgreSQL rodando:

1. Edite `backend/.env`
2. Atualize `DATABASE_URL` com seus dados:
```env
DATABASE_URL=postgresql://SEU_USUARIO:SUA_SENHA@localhost:5432/yugioh
```

### Se você NÃO tem PostgreSQL:

**Opção 1: Docker (Recomendado)**
```bash
docker run --name yugioh-postgres -e POSTGRES_PASSWORD=senha123 -e POSTGRES_DB=yugioh -p 5432:5432 -d postgres
```

Depois configure no `.env`:
```env
DATABASE_URL=postgresql://postgres:senha123@localhost:5432/yugioh
```

**Opção 2: Instalar PostgreSQL**
- Baixe e instale o PostgreSQL
- Crie um banco de dados chamado `yugioh`
- Configure a URL no `.env`

## ✅ Passo 4: Verificar Configuração

### Backend

1. Instale as dependências (se ainda não fez):
```bash
cd backend
npm install
```

2. Verifique se o arquivo `.env` está correto:
```bash
# Windows PowerShell
Get-Content .env

# Linux/Mac
cat .env
```

3. Teste a conexão com o banco:
```bash
npm run start:dev
```

Se aparecer erros de conexão, verifique:
- ✅ PostgreSQL está rodando?
- ✅ `DATABASE_URL` está correto?
- ✅ Usuário e senha estão corretos?

### Frontend

1. Instale as dependências (se ainda não fez):
```bash
cd frontend
npm install
```

2. Verifique se o arquivo `.env.local` está correto:
```bash
# Windows PowerShell
Get-Content .env.local

# Linux/Mac
cat .env.local
```

## 🚀 Passo 5: Rodar o Projeto

### Terminal 1 - Backend:
```bash
cd backend
npm run start:dev
```

Você deve ver:
```
🚀 Yu-Gi-Oh! Backend running on: http://localhost:3000
📚 API Documentation: http://localhost:3000/api/docs
🎮 WebSocket server ready for duels!
```

### Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```

Você deve ver:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

## 🧪 Passo 6: Testar se Está Funcionando

1. **Acesse o frontend**: http://localhost:5173
2. **Acesse a documentação da API**: http://localhost:3000/api/docs
3. **Teste login**: Tente fazer login no frontend
4. **Verifique console do navegador**: Não deve ter erros de CORS ou conexão

## 📦 Passo 7: Para Produção

### Backend - Criar `.env.production`:

1. Crie `backend/.env.production`:
```env
NODE_ENV=production
PORT=3000

# CORS - URL exata do seu frontend (com https://)
CORS_ORIGIN=https://seu-frontend.com

# Banco de Dados
DATABASE_URL=postgresql://usuario:senha@host:5432/yugioh

# JWT - Use a mesma chave ou gere uma nova
JWT_SECRET=SUA-CHAVE-SECRETA-AQUI
JWT_EXPIRES_IN=7d
```

### Frontend - Criar `.env.production`:

1. Crie `frontend/.env.production`:
```env
# URL da API do backend (HTTPS obrigatório)
VITE_API_URL=https://api.seudominio.com

# WebSocket (use wss:// para HTTPS)
VITE_WS_URL=wss://api.seudominio.com
```

2. Build do frontend:
```bash
cd frontend
npm run build
```

Os arquivos estarão em `frontend/dist/`

3. Build do backend:
```bash
cd backend
npm run build
npm run start:prod
```

## 🔍 Troubleshooting

### Erro: "Cannot find module"
**Solução**: Execute `npm install` na pasta correspondente

### Erro: "Connection refused" no banco
**Solução**: 
- Verifique se PostgreSQL está rodando
- Verifique se `DATABASE_URL` está correto
- Teste a conexão: `psql -U usuario -d yugioh`

### Erro de CORS no navegador
**Solução**:
- Verifique se `CORS_ORIGIN` no backend está correto
- Certifique-se de que não há trailing slash (`/`) no final
- Reinicie o backend após alterar `.env`

### WebSocket não conecta
**Solução**:
- Verifique se `VITE_WS_URL` está correto
- Em produção, use `wss://` (não `ws://`)
- Verifique se o backend está acessível

### Imagens não carregam
**Solução**:
- Verifique se o backend está servindo arquivos em `/uploads/`
- Verifique se `VITE_API_URL` está correto

## 📝 Checklist Final

Antes de começar a desenvolver, verifique:

- [ ] Arquivo `backend/.env` criado e configurado
- [ ] Arquivo `frontend/.env.local` criado e configurado
- [ ] Chave JWT gerada e configurada
- [ ] Banco de dados PostgreSQL configurado e acessível
- [ ] Backend rodando sem erros
- [ ] Frontend rodando sem erros
- [ ] Login funcionando
- [ ] Sem erros no console do navegador

## 🎯 Próximos Passos

Depois que tudo estiver funcionando:

1. ✅ Leia `DEPLOY_SEPARADO.md` para deploy em servidores separados
2. ✅ Leia `SETUP_DEPLOY.md` para guia rápido de deploy
3. ✅ Configure variáveis de ambiente no servidor de produção
4. ✅ Configure SSL/HTTPS para produção

