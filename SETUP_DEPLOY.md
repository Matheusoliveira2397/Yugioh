# Guia Rápido de Setup para Deploy

## Passo 1: Configurar Backend

1. Copie o arquivo de exemplo:
```bash
cd backend
cp .env.example .env
```

2. Edite o arquivo `.env` e configure:
   - `DATABASE_URL`: URL do seu banco PostgreSQL
   - `CORS_ORIGIN`: URL do seu frontend (ex: `https://seu-frontend.com`)
   - `JWT_SECRET`: Gere uma chave secreta forte
   - Outras variáveis conforme necessário

3. Gere uma chave JWT secreta:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Passo 2: Configurar Frontend

1. Para desenvolvimento local:
```bash
cd frontend
cp .env.example .env.local
```

2. Para produção:
```bash
cd frontend
cp .env.production.example .env.production
```

3. Edite o arquivo e configure:
   - `VITE_API_URL`: URL do seu backend (ex: `https://api.seudominio.com`)
   - `VITE_WS_URL`: URL do WebSocket (ex: `wss://api.seudominio.com`)

## Passo 3: Build e Deploy

### Backend:
```bash
cd backend
npm install
npm run build
npm run start:prod
```

### Frontend:
```bash
cd frontend
npm install
npm run build
# Os arquivos estarão em frontend/dist/
```

## Verificação Rápida

1. **Backend rodando?**
   - Acesse: `http://seu-backend:3000/api/docs`
   - Deve mostrar a documentação Swagger

2. **CORS configurado?**
   - No console do navegador, não deve ter erros de CORS
   - Verifique se `CORS_ORIGIN` no backend está correto

3. **WebSocket conectando?**
   - No console do navegador, deve aparecer: `✅ Socket conectado`
   - Se não conectar, verifique `VITE_WS_URL` no frontend

## Troubleshooting

### Erro de CORS
- Verifique se `CORS_ORIGIN` no backend está exatamente igual à URL do frontend
- Certifique-se de que não há trailing slash (`/`) no final

### WebSocket não conecta
- Use `wss://` para HTTPS (não `ws://`)
- Verifique se o backend está acessível
- Verifique firewall/proxy reverso

### Imagens não carregam
- Certifique-se de que o backend está servindo arquivos em `/uploads/`
- Verifique se as URLs usam `VITE_API_URL`

## Arquivos Criados

- `backend/.env.example` - Template para desenvolvimento
- `backend/.env.production.example` - Template para produção
- `frontend/.env.example` - Template para desenvolvimento
- `frontend/.env.production.example` - Template para produção
- `DEPLOY_SEPARADO.md` - Guia completo de deploy
- `SETUP_DEPLOY.md` - Este arquivo (guia rápido)


