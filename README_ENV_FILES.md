# Arquivos de Configuração (.env)

Este guia explica como criar os arquivos de configuração necessários para o projeto.

## Arquivos Necessários

Você precisa criar os seguintes arquivos:

### Backend:
- `backend/.env` (desenvolvimento)
- `backend/.env.production` (produção)

### Frontend:
- `frontend/.env.local` (desenvolvimento)
- `frontend/.env.production` (produção)

## Como Criar os Arquivos

### Opção 1: Usar os Templates

Copie e cole o conteúdo abaixo nos arquivos correspondentes:

### Backend `.env` (Desenvolvimento)

```env
PORT=3000
NODE_ENV=development

# CORS - URL do frontend
CORS_ORIGIN=http://localhost:5173

# Banco de Dados PostgreSQL
DATABASE_URL=postgresql://usuario:senha@localhost:5432/yugioh

# MongoDB (Opcional)
MONGODB_URI=mongodb://localhost:27017/yugioh-chat

# Redis (Opcional)
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=sua-chave-secreta-aqui
JWT_EXPIRES_IN=7d

# Upload
MAX_FILE_SIZE=10485760

# Email (Opcional - para verificação de email)
EMAIL_USER=seu-email@gmail.com
EMAIL_PASSWORD=sua-senha-de-app-do-gmail
FRONTEND_URL=http://localhost:5173

# Configurações
HTTP_TIMEOUT=30000
MAX_CONNECTIONS=2000
LOG_LEVEL=info
```

### Backend `.env.production` (Produção)

```env
NODE_ENV=production
PORT=3000

# CORS - URL exata do frontend (com https://)
CORS_ORIGIN=https://seu-frontend.com

# Banco de Dados PostgreSQL
DATABASE_URL=postgresql://usuario:senha@host:5432/yugioh

# MongoDB (Opcional)
MONGODB_URI=mongodb://host:27017/yugioh-chat

# Redis (Opcional)
REDIS_URL=redis://host:6379

# JWT - GERE UMA CHAVE FORTE!
JWT_SECRET=SUA-CHAVE-SECRETA-SUPER-FORTE-AQUI
JWT_EXPIRES_IN=7d

# Email (Opcional - para verificação de email)
EMAIL_USER=seu-email@gmail.com
EMAIL_PASSWORD=sua-senha-de-app-do-gmail
FRONTEND_URL=https://seu-frontend.com
```

### Frontend `.env.local` (Desenvolvimento)

```env
# URL da API do backend
VITE_API_URL=http://localhost:3000

# WebSocket (opcional - usa VITE_API_URL se não especificado)
VITE_WS_URL=
```

### Frontend `.env.production` (Produção)

```env
# URL da API do backend (HTTPS obrigatório)
VITE_API_URL=https://api.seudominio.com

# WebSocket (use wss:// para HTTPS)
VITE_WS_URL=wss://api.seudominio.com
```

## Gerar Chave JWT Secreta

Para gerar uma chave JWT segura, execute:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copie o resultado e cole no campo `JWT_SECRET` do arquivo `.env`.

## Verificação

Após criar os arquivos:

1. **Backend**: Certifique-se de que `DATABASE_URL` está correto
2. **Backend**: Verifique se `CORS_ORIGIN` corresponde à URL do frontend
3. **Frontend**: Verifique se `VITE_API_URL` aponta para o backend correto
4. **Frontend**: Em produção, use `wss://` para WebSocket (não `ws://`)

## Importante

- ⚠️ **NUNCA** commite arquivos `.env` com valores reais
- ✅ Os arquivos `.env*` já estão no `.gitignore`
- ✅ Use variáveis de ambiente do servidor em produção quando possível
- ✅ Mantenha `JWT_SECRET` seguro e único
- 📧 **Para configurar email**: Veja o arquivo `CONFIGURAR_EMAIL.md` para instruções detalhadas

## Scripts Alternativos

Se preferir usar scripts:

- **Windows**: Execute `scripts/create-env-files.ps1`
- **Linux/Mac**: Execute `bash scripts/create-env-files.sh`

Ou crie os arquivos manualmente usando os templates acima.


