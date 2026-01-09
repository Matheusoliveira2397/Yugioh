# 📦 Como Fazer Dump do Banco Supabase

## 🚀 Método Rápido (Recomendado)

### Passo 1: Obter Connection String do Supabase

1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **Settings** → **Database**
4. Role até **"Connection string"**
5. Escolha **"Direct connection"** (porta 5432)
6. Copie a connection string completa
7. **IMPORTANTE**: Substitua `[YOUR-PASSWORD]` pela senha real do banco

Exemplo:
```
postgresql://postgres.mantttrvvhevfjxojstn:SUA_SENHA_REAL@db.mantttrvvhevfjxojstn.supabase.co:5432/postgres
```

### Passo 2: Executar o Script

No PowerShell, na pasta raiz do projeto:

```powershell
.\dump-supabase-simples.ps1 -ConnectionString "postgresql://postgres.xxxxx:SUA_SENHA@db.xxxxx.supabase.co:5432/postgres"
```

**Substitua pelos seus valores reais!**

### Passo 3: Aguardar

O script criará um arquivo: `yugioh_backup_YYYYMMDD_HHMMSS.sql`

---

## 📋 Exemplo Completo

```powershell
# Exemplo (SUBSTITUA pelos seus valores):
.\dump-supabase-simples.ps1 -ConnectionString "postgresql://postgres.mantttrvvhevfjxojstn:MinhaSenha123@db.mantttrvvhevfjxojstn.supabase.co:5432/postgres"
```

---

## 🔍 Verificar se Funcionou

Após executar, você verá:
- ✅ "Dump criado com sucesso!"
- ✅ Nome do arquivo criado
- ✅ Tamanho do arquivo

O arquivo estará na pasta raiz do projeto.

---

## ⚠️ Dicas Importantes

1. **Senha**: Certifique-se de substituir `[YOUR-PASSWORD]` pela senha real
2. **Porta**: Use a porta `5432` (Direct connection), não `6543` (pooler)
3. **SSL**: A connection string já inclui `?sslmode=require` se necessário
4. **Tamanho**: Dumps grandes podem levar alguns minutos

---

## 🆘 Se Der Erro

### Erro: "Connection refused"
- Verifique se a connection string está correta
- Verifique se está usando "Direct connection" (porta 5432)

### Erro: "Authentication failed"
- Verifique se a senha está correta
- Certifique-se de substituir `[YOUR-PASSWORD]` pela senha real

### Erro: "Docker not running"
- Inicie o Docker Desktop
- Aguarde alguns segundos e tente novamente

---

## 📁 Onde Está o Arquivo?

O dump será criado na pasta raiz do projeto com o nome:
```
yugioh_backup_YYYYMMDD_HHMMSS.sql
```

Exemplo: `yugioh_backup_20260109_143022.sql`

---

## ✅ Próximos Passos

Depois de criar o dump, você pode:
1. Usar para restaurar em outro banco
2. Fazer backup local
3. Compartilhar se necessário

Para restaurar, veja: `COMO_RESTAURAR_DUMP.md`

