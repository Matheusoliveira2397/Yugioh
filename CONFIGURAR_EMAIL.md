# 📧 Como Configurar o Envio de Emails de Verificação

Este guia explica como configurar o sistema de envio de emails para verificação de contas.

## 📋 Pré-requisitos

Você precisa de:
- Uma conta de email (Gmail, Outlook, ou outro provedor SMTP)
- Acesso às configurações de segurança da conta de email

## 🔧 Configuração com Gmail (Recomendado)

### Passo 1: Criar Senha de App do Gmail

1. Acesse sua conta Google: https://myaccount.google.com/
2. Vá em **Segurança** (Security)
3. Ative a **Verificação em duas etapas** (se ainda não estiver ativada)
4. Role até **Senhas de app** (App passwords)
5. Selecione **App** → **Outro (Nome personalizado)**
6. Digite um nome (ex: "Yu-Gi-Oh Game")
7. Clique em **Gerar**
8. **Copie a senha gerada** (16 caracteres, sem espaços)

⚠️ **IMPORTANTE**: Use a **Senha de App**, NÃO a senha normal da sua conta Google!

### Passo 2: Configurar Variáveis de Ambiente

No arquivo `backend/.env`, adicione as seguintes variáveis:

```env
# Configuração de Email
EMAIL_USER=seu-email@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx

# URL do Frontend (para links de verificação)
FRONTEND_URL=http://localhost:5173
```

**Exemplo:**
```env
EMAIL_USER=meujogo@gmail.com
EMAIL_PASSWORD=abcd efgh ijkl mnop
FRONTEND_URL=http://localhost:5173
```

### Passo 3: Reiniciar o Servidor

Após adicionar as variáveis, reinicie o servidor backend:

```bash
cd backend
npm run start:dev
```

## 🔧 Configuração com Outlook/Hotmail

### Passo 1: Obter Senha de App

1. Acesse: https://account.microsoft.com/security
2. Ative a **Verificação em duas etapas**
3. Vá em **Segurança** → **Senhas de app**
4. Gere uma nova senha de app
5. Copie a senha gerada

### Passo 2: Configurar Variáveis

No arquivo `backend/.env`:

```env
EMAIL_USER=seu-email@outlook.com
EMAIL_PASSWORD=sua-senha-de-app
FRONTEND_URL=http://localhost:5173
```

**Nota**: O código atual está configurado para Gmail. Para usar Outlook, você precisará ajustar o `mail.service.ts`:

```typescript
// Para Outlook, use:
host: 'smtp-mail.outlook.com',
port: 587,
```

## 🔧 Configuração com Outros Provedores SMTP

### Exemplos de Configuração

#### Yahoo Mail
```env
EMAIL_USER=seu-email@yahoo.com
EMAIL_PASSWORD=sua-senha-de-app
```

No código, use:
```typescript
host: 'smtp.mail.yahoo.com',
port: 587,
```

#### SendGrid
```env
EMAIL_USER=apikey
EMAIL_PASSWORD=sua-api-key-do-sendgrid
```

No código, use:
```typescript
host: 'smtp.sendgrid.net',
port: 587,
auth: {
  user: 'apikey',
  pass: process.env.EMAIL_PASSWORD,
}
```

#### Mailgun
```env
EMAIL_USER=postmaster@seu-dominio.mailgun.org
EMAIL_PASSWORD=sua-senha-do-mailgun
```

No código, use:
```typescript
host: 'smtp.mailgun.org',
port: 587,
```

## 🧪 Testando a Configuração

### 1. Verificar se as Variáveis Estão Configuradas

Ao iniciar o servidor, você verá uma das seguintes mensagens:

✅ **Email configurado:**
```
✅ Email configurado e pronto para enviar
```

⚠️ **Email não configurado:**
```
⚠️ Email não configurado - links aparecerão no console
```

### 2. Testar Registro de Usuário

1. Acesse a página de registro
2. Crie uma nova conta
3. Verifique:

   **Se email estiver configurado:**
   - Você receberá um email com o link de verificação
   - O email aparecerá na caixa de entrada (ou spam)

   **Se email NÃO estiver configurado:**
   - O link aparecerá no console do servidor
   - Copie o link e cole no navegador para verificar

### 3. Verificar Logs do Servidor

Quando um email é enviado, você verá:

```
✅ Email de verificação enviado para: usuario@email.com
```

Se houver erro:

```
❌ Erro ao enviar email: [detalhes do erro]
```

## 🔍 Solução de Problemas

### Erro: "Invalid login"

**Causa**: Senha incorreta ou não está usando senha de app

**Solução**:
1. Verifique se está usando a **Senha de App** (não a senha normal)
2. Certifique-se de que copiou a senha completa (16 caracteres)
3. Remova espaços da senha se houver

### Erro: "Connection timeout"

**Causa**: Firewall ou configuração de rede

**Solução**:
1. Verifique se a porta 587 está aberta
2. Tente usar a porta 465 com `secure: true`:

```typescript
port: 465,
secure: true,
```

### Erro: "Email não está sendo enviado"

**Causa**: Variáveis de ambiente não estão sendo lidas

**Solução**:
1. Verifique se o arquivo `.env` está na pasta `backend/`
2. Reinicie o servidor após alterar o `.env`
3. Verifique se não há espaços extras nas variáveis:

```env
# ❌ ERRADO
EMAIL_USER = seu-email@gmail.com

# ✅ CORRETO
EMAIL_USER=seu-email@gmail.com
```

### Email vai para Spam

**Solução**:
1. Adicione o email remetente aos contatos
2. Marque como "Não é spam"
3. Configure SPF/DKIM no domínio (para produção)

## 📝 Exemplo Completo de `.env`

```env
# Servidor
PORT=3000
NODE_ENV=development

# CORS
CORS_ORIGIN=http://localhost:5173

# Banco de Dados
DATABASE_URL=postgresql://usuario:senha@localhost:5432/yugioh

# JWT
JWT_SECRET=sua-chave-secreta-aqui
JWT_EXPIRES_IN=7d

# Email (Gmail)
EMAIL_USER=seu-email@gmail.com
EMAIL_PASSWORD=abcd efgh ijkl mnop

# Frontend URL (para links de verificação)
FRONTEND_URL=http://localhost:5173
```

## 🚀 App online (produção) – email não envia?

**Se o cadastro funciona localmente mas online o email não é enviado**, o motivo quase sempre é: **as variáveis de ambiente não estão configuradas no servidor**.

No painel da sua hospedagem (Railway, Render, VPS, Heroku, etc.):

1. Vá em **Variáveis de ambiente** / **Environment Variables**.
2. Adicione (ou edite):
   - `EMAIL_USER` = seu email (ex: `meujogo@gmail.com`)
   - `EMAIL_PASSWORD` = **Senha de app** do Gmail (não a senha normal da conta)
   - `FRONTEND_URL` = **URL real do seu site** (ex: `https://yugiohrpg.com`), **não** use `localhost`

3. Salve e **reinicie/refaça o deploy** do backend para carregar as variáveis.

Sem essas três variáveis no servidor, o backend não consegue enviar email e o usuário vê "Email não foi enviado automaticamente".

**Dica:** Alguns provedores bloqueiam a porta 587 (SMTP). Se mesmo com as variáveis corretas o email não sair, confira os logs do backend no painel da hospedagem ou use um serviço como SendGrid (veja abaixo).

---

## 🚀 Para Produção (opcional: usar serviço de email)

Em produção, use variáveis de ambiente do servidor ou um serviço de email profissional:

### Opções Recomendadas para Produção:

1. **SendGrid** - 100 emails/dia grátis
2. **Mailgun** - 5.000 emails/mês grátis
3. **Amazon SES** - Muito barato, paga apenas pelo uso
4. **Resend** - Moderno e fácil de usar

### Exemplo com SendGrid:

```env
EMAIL_USER=apikey
EMAIL_PASSWORD=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

E ajuste o `mail.service.ts`:

```typescript
this.transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: 'apikey',
    pass: process.env.EMAIL_PASSWORD,
  },
});
```

## ✅ Checklist

- [ ] Conta de email configurada
- [ ] Verificação em duas etapas ativada
- [ ] Senha de app gerada
- [ ] Variáveis `EMAIL_USER` e `EMAIL_PASSWORD` no `.env`
- [ ] Variável `FRONTEND_URL` configurada
- [ ] Servidor reiniciado
- [ ] Teste de registro realizado
- [ ] Email recebido (ou link no console)

## 📞 Precisa de Ajuda?

Se ainda tiver problemas:
1. Verifique os logs do servidor
2. Teste com outro provedor de email
3. Verifique se o firewall não está bloqueando a porta 587

---

**Pronto!** Agora seu sistema de verificação de email está configurado! 🎉

