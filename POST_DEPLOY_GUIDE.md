# 🎯 Primeiros Passos Após o Deploy

## ✅ Checklist de Validação

Após fazer o deploy, siga estes passos para garantir que tudo está funcionando:

---

## 1️⃣ Verificar Frontend (Vercel)

### ✅ Teste Básico
1. Acesse sua URL do Vercel: `https://seu-app.vercel.app`
2. A página inicial deve carregar sem erros 404
3. Abra o DevTools (F12) → Console
4. **NÃO deve ter erros vermelhos**

### ✅ Teste de Registro
1. Clique em "Registrar"
2. Preencha os dados:
   - Nickname: `TestUser`
   - Email: `test@example.com`
   - Password: `Test123456`
3. Clique em "Criar Conta"
4. **Deve mostrar**: "Conta criada! Verifique seu email"

### ✅ Teste de Login
1. Vá para "Login"
2. Entre com o email e senha criados
3. **Deve redirecionar** para a Home Page
4. **Deve mostrar** seu nickname no topo

### ✅ Teste de WebSocket
1. Na Home Page, role até o **Chat Global**
2. Digite uma mensagem e envie
3. **Deve aparecer** na lista de mensagens em tempo real
4. Se não aparecer → problema no WebSocket

---

## 2️⃣ Verificar Backend (Railway/Render)

### ✅ Teste de Health Check
```bash
# Substitua pela URL do seu backend
curl https://seu-backend.railway.app/health

# Deve retornar:
# {"status":"ok","timestamp":"2024-..."}
```

### ✅ Verificar Logs do Backend
1. Acesse o **Railway Dashboard**
2. Clique no serviço do backend
3. Vá em **Deployments** → **View Logs**
4. **Procure por**:
   ```
   ✅ Database connected successfully
   ✅ Redis connected successfully
   ✅ MongoDB connected successfully
   ✅ Nest application successfully started on port 3000
   ```

### ✅ Testar Endpoints
```bash
# Teste de registro (substitua a URL)
curl -X POST https://seu-backend.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "nickname": "TestUser2",
    "email": "test2@example.com",
    "password": "Test123456"
  }'

# Deve retornar algo como:
# {"message":"User registered successfully"}
```

---

## 3️⃣ Verificar Bancos de Dados

### ✅ PostgreSQL (Railway)
1. No Railway Dashboard → PostgreSQL
2. Clique em **Connect**
3. Use o comando ou ferramenta como TablePlus
4. Execute:
   ```sql
   SELECT COUNT(*) FROM users;
   ```
5. **Deve retornar** o número de usuários cadastrados

### ✅ MongoDB (Railway)
1. No Railway Dashboard → MongoDB
2. Clique em **Connect**
3. Use MongoDB Compass com a connection string
4. Verifique database `yugioh_chat`
5. Collection `messages` deve existir

### ✅ Redis (Railway)
1. No Railway Dashboard → Redis
2. Verifique que está "Running"
3. (Opcional) Use Redis CLI:
   ```bash
   redis-cli -h seu-redis.railway.app -p 6379
   PING
   # Deve retornar: PONG
   ```

---

## 4️⃣ Configurar Primeiro Admin

### Opção 1: Via PostgreSQL (Recomendado)
```sql
-- Conecte ao PostgreSQL via Railway
UPDATE users 
SET role = 'MASTER' 
WHERE email = 'seu-email@exemplo.com';
```

### Opção 2: Via Backend (API)
```bash
# Se você criou um endpoint de promoção
curl -X POST https://seu-backend.railway.app/admin/promote \
  -H "Authorization: Bearer SEU_TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"userId": 1, "role": "MASTER"}'
```

### ✅ Validar Admin
1. Faça login com a conta promovida
2. No frontend, clique no perfil → **Admin Panel**
3. **Deve aparecer** o painel completo

---

## 5️⃣ Testar Funcionalidades Principais

### ✅ Deck Builder
1. Vá em **Deck Builder**
2. **Deve carregar** a lista de cartas
3. Arraste uma carta para o deck
4. Clique em **Salvar**
5. **Deve mostrar** "Deck salvo com sucesso!"

### ✅ Loja de Cartas
1. Vá em **Loja**
2. **Deve listar** cartas disponíveis
3. Clique em **Comprar** em uma carta
4. **Deve descontar** gemas e adicionar ao inventário

### ✅ Random Duel
1. Clique em **Duelo Aleatório**
2. **Deve entrar** na fila de matchmaking
3. (Se houver 2 jogadores online) → Inicia duelo
4. **Deve carregar** a arena de duelo

### ✅ Arena de Desafios
1. Na Home Page, veja **Arena de Desafios**
2. **Deve mostrar** o evento ativo ou próximo
3. Contador regressivo deve funcionar
4. Clique em **Entrar** → vai para matchmaking

### ✅ Chat Global
1. Digite mensagem no chat
2. **Deve aparecer** instantaneamente
3. Abra em outra janela/navegador
4. **Deve sincronizar** em tempo real

### ✅ Torneios
1. Admin cria um torneio no Admin Panel
2. Usuários veem na página **Torneios**
3. **Devem poder se inscrever**
4. Admin inicia → **Brackets são gerados**

---

## 6️⃣ Configurações Finais

### ✅ Variáveis de Ambiente (Vercel)
Confirme no Vercel Dashboard → Settings → Environment Variables:
```
VITE_API_URL = https://seu-backend.railway.app
VITE_WS_URL = https://seu-backend.railway.app
```

### ✅ Variáveis de Ambiente (Railway)
Confirme no Railway Dashboard → Variables:
```
DATABASE_URL = postgresql://...
MONGO_URI = mongodb://...
REDIS_URL = redis://...
CORS_ORIGIN = https://seu-app.vercel.app
JWT_SECRET = seu-secret-aleatorio
FRONTEND_URL = https://seu-app.vercel.app
```

### ✅ CORS no Backend
No `backend/src/main.ts`, deve ter:
```typescript
app.enableCors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
});
```

---

## 7️⃣ Adicionar Cartas Iniciais

### Via SQL
```sql
-- Conecte ao PostgreSQL
-- Execute o script de cartas
\i add-cards-to-shop.sql
```

### Via Admin Panel
1. Login como Admin
2. Admin Panel → **Cartas**
3. Clique em **+ Nova Carta**
4. Preencha:
   - Nome: `Dragão Branco de Olhos Azuis`
   - Tipo: `Monster`
   - ATK: `3000`
   - DEF: `2500`
   - Level: `8`
   - Descrição: `Este lendário dragão é uma poderosa...`
5. Upload da imagem
6. Salvar

---

## 8️⃣ Monitoramento

### ✅ Logs em Tempo Real (Railway)
```bash
# Via CLI
railway logs --follow

# Ou pelo dashboard
Railway → Your Service → Logs
```

### ✅ Métricas (Railway)
1. Dashboard → Metrics
2. Verifique:
   - **CPU Usage** (deve ficar < 80%)
   - **Memory Usage** (deve ficar < 80%)
   - **Network** (requisições/segundo)

### ✅ Erros no Frontend (Vercel)
1. Vercel Dashboard → Analytics
2. Veja:
   - **Page Views**
   - **Unique Visitors**
   - **Top Pages**
3. Vercel Dashboard → Logs
   - **Build Logs** (erros de build)
   - **Runtime Logs** (erros de runtime)

---

## 9️⃣ Troubleshooting Comum

### ❌ Frontend não conecta ao backend
**Problema**: CORS bloqueando requisições

**Solução**:
1. Railway → Backend → Variables
2. Confirme: `CORS_ORIGIN=https://seu-app.vercel.app`
3. Redeploy: `railway up`

### ❌ WebSocket não funciona
**Problema**: WSS não configurado

**Solução**:
1. Backend deve aceitar conexões WSS
2. Frontend deve usar `https://` no `VITE_WS_URL`
3. No `backend/src/main.ts`:
```typescript
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});
```

### ❌ Imagens não carregam
**Problema**: Upload de arquivos não persistente

**Solução**:
Use um serviço externo:
- **Cloudinary** (grátis 25GB)
- **AWS S3**
- **ImgBB**

Ou monte volume no Railway:
```json
{
  "volumes": [
    {
      "name": "uploads",
      "mountPath": "/app/uploads"
    }
  ]
}
```

### ❌ Email não envia
**Problema**: Credenciais inválidas ou sem senha de aplicativo

**Solução**:
1. Gmail → Configurações → Segurança
2. Ative **Verificação em 2 etapas**
3. Gere **Senha de aplicativo**
4. Use essa senha no `MAIL_PASSWORD`

### ❌ Database connection timeout
**Problema**: IP não whitelistado ou limite de conexões

**Solução Railway**:
1. Railway já gerencia isso automaticamente
2. Se persistir, aumente `max_connections` no PostgreSQL

### ❌ Out of memory
**Problema**: Container sem recursos suficientes

**Solução**:
1. Railway: Upgrade para Pro ($5/mês = 8GB RAM)
2. Otimize queries pesadas
3. Adicione índices no banco:
```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_duels_player ON duels(player1_id, player2_id);
```

---

## 🎉 Pronto!

Se todos os testes passaram, seu jogo está **100% funcional** em produção!

### 📊 Dashboard de Monitoramento
- **Vercel**: https://vercel.com/dashboard
- **Railway**: https://railway.app/dashboard

### 📱 Compartilhe
Envie o link para seus amigos:
```
🎮 Jogue Yu-Gi-Oh! Online:
https://seu-app.vercel.app

📊 Entre no ranking e desafie os melhores!
```

### 🚀 Próximos Passos
- [ ] Adicione mais cartas na loja
- [ ] Crie torneios semanais
- [ ] Configure domínio customizado
- [ ] Adicione Google Analytics
- [ ] Configure backup automático do banco

---

<div align="center">

**✨ Parabéns pelo deploy! ✨**

Se precisar de ajuda, abra uma [Issue](https://github.com/Matheusoliveira2397/Yugioh/issues)

</div>
