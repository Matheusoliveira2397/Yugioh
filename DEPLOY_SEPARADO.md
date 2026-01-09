# Guia de Deploy em Servidores Separados

Este guia explica como configurar o frontend e backend em servidores diferentes.

## Configuração do Backend

### 1. Variáveis de Ambiente

Crie um arquivo `.env` no diretório `backend/` com as seguintes variáveis:

```env
# Porta do servidor
PORT=3000

# CORS - IMPORTANTE: Configure com a URL do seu frontend
CORS_ORIGIN=https://seu-frontend.com

# Database
DATABASE_HOST=seu-host-postgres
DATABASE_PORT=5432
DATABASE_USER=seu-usuario
DATABASE_PASSWORD=sua-senha
DATABASE_NAME=yugioh

# JWT
JWT_SECRET=seu-jwt-secret
JWT_EXPIRES_IN=7d

# Outras variáveis necessárias...
```

### 2. Configuração de CORS

O backend já está configurado para aceitar requisições de outros domínios através da variável `CORS_ORIGIN`:

- **Arquivo**: `backend/src/main.ts` (linha 122-125)
- **Configuração atual**: Usa `process.env.CORS_ORIGIN || 'http://localhost:5173'`
- **WebSocket**: Já configurado com `origin: '*'` no `duels.gateway.ts` (linha 25-28)

### 3. Deploy do Backend

```bash
cd backend
npm install
npm run build
npm run start:prod
```

Ou usando PM2:

```bash
pm2 start ecosystem.config.js
```

## Configuração do Frontend

### 1. Variáveis de Ambiente

Crie um arquivo `.env` ou `.env.production` no diretório `frontend/`:

```env
# URL da API do backend (HTTP)
VITE_API_URL=https://seu-backend.com

# URL do WebSocket (opcional, usa VITE_API_URL se não especificado)
VITE_WS_URL=wss://seu-backend.com
```

**IMPORTANTE**: 
- Use `https://` para produção
- Use `wss://` para WebSocket em produção (não `ws://`)
- Se não especificar `VITE_WS_URL`, o frontend usará `VITE_API_URL` automaticamente

### 2. Build do Frontend

```bash
cd frontend
npm install
npm run build
```

O build será gerado na pasta `frontend/dist/`

### 3. Deploy do Frontend

#### Opção 1: Servidor Nginx

1. Copie os arquivos de `frontend/dist/` para o diretório do Nginx (ex: `/var/www/html`)

2. Configure o Nginx (`/etc/nginx/sites-available/seu-site`):

```nginx
server {
    listen 80;
    server_name seu-frontend.com;

    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy para o backend (opcional, se quiser usar proxy reverso)
    location /api {
        proxy_pass https://seu-backend.com;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### Opção 2: Servidor Node.js (serve)

```bash
npm install -g serve
serve -s dist -l 3000
```

#### Opção 3: Vercel/Netlify

1. Conecte seu repositório GitHub
2. Configure as variáveis de ambiente:
   - `VITE_API_URL=https://seu-backend.com`
   - `VITE_WS_URL=wss://seu-backend.com`
3. Deploy automático

## Verificação

### 1. Verificar CORS

No console do navegador, verifique se não há erros de CORS:

```
Access to fetch at 'https://seu-backend.com/api/...' from origin 'https://seu-frontend.com' has been blocked by CORS policy
```

Se aparecer este erro, verifique:
- A variável `CORS_ORIGIN` no backend está correta
- O backend está rodando e acessível
- O protocolo (http/https) está correto

### 2. Verificar WebSocket

No console do navegador, você deve ver:

```
✅ Socket conectado: [socket-id]
```

Se não conectar, verifique:
- A URL do WebSocket está correta (`wss://` para HTTPS)
- O backend está aceitando conexões WebSocket
- Não há firewall bloqueando a porta

### 3. Verificar API

Teste uma requisição simples:

```javascript
fetch('https://seu-backend.com/api/auth/me', {
  headers: {
    'Authorization': 'Bearer seu-token'
  }
})
```

## Configuração de SSL/HTTPS

### Backend (Nginx como Proxy Reverso)

```nginx
server {
    listen 443 ssl;
    server_name seu-backend.com;

    ssl_certificate /caminho/para/certificado.crt;
    ssl_certificate_key /caminho/para/chave.key;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Frontend (Nginx)

```nginx
server {
    listen 443 ssl;
    server_name seu-frontend.com;

    ssl_certificate /caminho/para/certificado.crt;
    ssl_certificate_key /caminho/para/chave.key;

    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Troubleshooting

### Problema: CORS Error

**Solução**: 
1. Verifique `CORS_ORIGIN` no backend
2. Certifique-se de que a URL está exatamente igual (com/sem trailing slash)
3. Reinicie o backend após alterar `.env`

### Problema: WebSocket não conecta

**Solução**:
1. Verifique se está usando `wss://` para HTTPS
2. Verifique se o backend está acessível na porta correta
3. Verifique firewall/proxy reverso

### Problema: Imagens não carregam

**Solução**:
1. Certifique-se de que o backend está servindo arquivos estáticos em `/uploads/`
2. Verifique se as URLs das imagens estão usando `VITE_API_URL`

## Exemplo Completo

### Backend (servidor-backend.com)

```env
PORT=3000
CORS_ORIGIN=https://servidor-frontend.com
DATABASE_HOST=db.example.com
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=senha123
DATABASE_NAME=yugioh
JWT_SECRET=seu-secret-aqui
```

### Frontend (servidor-frontend.com)

```env
VITE_API_URL=https://servidor-backend.com
VITE_WS_URL=wss://servidor-backend.com
```

## Notas Importantes

1. **WebSocket**: O WebSocket precisa usar `wss://` (WebSocket Secure) quando o frontend está em HTTPS, mesmo que o backend esteja em HTTP (se usar proxy reverso com SSL)

2. **CORS**: O backend precisa ter a URL exata do frontend na variável `CORS_ORIGIN`

3. **Cookies**: Se usar cookies, certifique-se de que ambos os servidores estão no mesmo domínio ou configure `SameSite=None; Secure`

4. **Uploads**: Arquivos enviados ao backend precisam estar acessíveis via URL pública (ex: `https://seu-backend.com/uploads/...`)


