# 📧 Guia de Configuração de Email - Yu-Gi-Oh Game

## ✅ Opção 1: Gmail (Recomendado para Teste)

### Passo 1: Criar Email do Jogo
1. Acesse: https://accounts.google.com/signup
2. Crie um email específico para o jogo
   - Exemplo: `yugioh.game.noreply@gmail.com`
   - Ou: `seunome.yugiohgame@gmail.com`

### Passo 2: Ativar Verificação em 2 Etapas
1. Acesse: https://myaccount.google.com/security
2. Clique em "Verificação em duas etapas"
3. Siga os passos para ativar (é necessário para gerar Senhas de App)

### Passo 3: Gerar Senha de App
1. Acesse: https://myaccount.google.com/apppasswords
2. Faça login se necessário
3. Em "Selecionar app", escolha "Outro (nome personalizado)"
4. Digite: "Yu-Gi-Oh Game"
5. Clique em "Gerar"
6. **COPIE A SENHA GERADA** (16 caracteres, tipo: `abcd efgh ijkl mnop`)

### Passo 4: Configurar no Projeto
Edite o arquivo `backend/.env`:

```env
EMAIL_USER=yugioh.game.noreply@gmail.com
EMAIL_PASSWORD=abcdefghijklmnop
```

**⚠️ IMPORTANTE:**
- Use a senha de app (16 caracteres), NÃO a senha da sua conta
- Remova os espaços da senha de app (cole tudo junto)
- Nunca compartilhe estas credenciais
- Adicione `.env` no `.gitignore`

---

## 🚀 Opção 2: Outros Serviços de Email

### SendGrid (Grátis até 100 emails/dia)
1. Crie conta em: https://sendgrid.com
2. Gere uma API Key
3. Altere `backend/src/modules/mail/mail.service.ts`:

```typescript
this.transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: 'apikey',
    pass: process.env.SENDGRID_API_KEY,
  },
});
```

### Outlook/Hotmail
```typescript
this.transporter = nodemailer.createTransport({
  service: 'hotmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});
```

### AWS SES (Para Produção)
- Mais confiável para produção
- Grátis até 62.000 emails/mês (dentro do free tier)
- Requer verificação de domínio

---

## 🧪 Testar Envio de Email

Depois de configurar, teste:

1. Limpe o banco de dados:
```bash
docker exec yugioh-postgres psql -U yugioh_user -d yugioh_db -c "DELETE FROM users;"
```

2. Acesse: http://localhost:5173/register

3. Preencha o formulário com **SEU EMAIL REAL**

4. Verifique:
   - ✅ Console do backend deve mostrar: "✅ Email de verificação enviado para: seu-email@gmail.com"
   - ✅ Você receberá um email com o link de confirmação
   - ✅ Email deve ter o visual estilizado do jogo

5. Clique no link no email ou copie e cole no navegador

6. Após verificação, você receberá outro email de boas-vindas! 🎉

---

## 🔍 Solução de Problemas

### ❌ Erro: "Invalid login: 535-5.7.8 Username and Password not accepted"
**Solução:**
- Certifique-se de que está usando a Senha de App, não a senha da conta
- Verifique se a verificação em 2 etapas está ativada
- Gere uma nova Senha de App

### ❌ Erro: "self signed certificate in certificate chain"
**Solução:**
```typescript
this.transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false
  }
});
```

### ❌ Email não chega
**Verifique:**
- Pasta de SPAM/Lixo Eletrônico
- Aguarde até 5 minutos
- Verifique os logs do backend: `docker logs yugioh-backend`

### ❌ Erro ao enviar mas usuário é criado
- O sistema já trata isso!
- O link aparecerá no console do backend como backup
- Verifique o log: `docker logs yugioh-backend 2>&1 | Select-String "Link de verificação"`

---

## 📝 Checklist Final

- [ ] Email do jogo criado
- [ ] Verificação em 2 etapas ativada
- [ ] Senha de App gerada
- [ ] Arquivo `.env` configurado
- [ ] Backend reiniciado: `docker-compose restart backend`
- [ ] Teste de registro realizado
- [ ] Email de verificação recebido
- [ ] Verificação funcionando
- [ ] Email de boas-vindas recebido

---

## 🎯 Próximos Passos

Depois que o email estiver funcionando:

1. **Adicionar Limite de Tentativas**: Evitar spam de registros
2. **Expiração de Token**: Tokens devem expirar em 24h
3. **Reenvio de Email**: Botão para reenviar confirmação
4. **Reset de Senha**: Sistema de recuperação por email
5. **Email de Mudança de Senha**: Notificar mudanças de segurança
6. **Templates Personalizados**: Melhorar design dos emails

---

## 💡 Dicas de Segurança

1. ✅ Use email dedicado para o jogo
2. ✅ Nunca commit o arquivo `.env`
3. ✅ Use variáveis de ambiente em produção
4. ✅ Monitore quantidade de emails enviados
5. ✅ Implemente rate limiting
6. ✅ Valide domínios de email (evitar emails descartáveis)

---

**Qualquer dúvida, me avise!** 🎴
