# 🚀 Solução Rápida: Supabase IPv6-Only

## ⚡ Solução Mais Rápida

Se o Supabase está em **IPv6-only** e você não consegue fazer o restore direto:

### **1. Converter Dump para SQL**

Execute este comando:

```powershell
cd D:\Yugioh

# Substitua pelo nome do seu dump
$dumpFile = "yugioh_backup_20250812_190833.dump"

# Converter para SQL usando Docker
docker run --rm `
    -v "${PWD}:/backup" `
    postgres:16 `
    pg_restore -Fc -f "/backup/backup.sql" "/backup/$dumpFile"
```

Isso criará `backup.sql` no diretório atual.

---

### **2. Importar via SQL Editor do Supabase**

1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **SQL Editor** (menu lateral)
4. Clique em **New Query**
5. Abra o arquivo `backup.sql`
6. **IMPORTANTE:** Se o arquivo for muito grande:
   - Divida em partes menores
   - Execute seção por seção
   - Ou use o script automatizado abaixo

---

### **3. Script Automatizado (Alternativa)**

Se preferir automatizar, use:

```powershell
# Executar script de restore com fallback para SQL
.\scripts\restore-supabase-ipv6.ps1 `
    -BackupFile "yugioh_backup_*.dump" `
    -SupabasePassword "Messi1997Oliveira@OP@"
```

O script tentará:
1. Restore direto (se IPv6 funcionar)
2. Se falhar, converte para SQL automaticamente
3. Você importa o SQL manualmente no Supabase

---

## 🔧 Habilitar IPv4 no Supabase (Se Disponível)

1. Acesse **Supabase Dashboard**
2. Vá em **Settings** > **Database**
3. Procure por **Network** ou **Connection Settings**
4. Verifique se há opção para **IPv4**
5. Se sim, habilite e aguarde alguns minutos

---

## ✅ Verificar se Funcionou

Após importar:

1. Vá em **Table Editor** no Supabase
2. Verifique se as tabelas têm dados
3. Execute uma query de teste:

```sql
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM cards;
```

---

## 📝 Notas

- **IPv6-only** é comum em alguns planos do Supabase
- A conversão para SQL é mais confiável que tentar forçar IPv6
- O SQL Editor do Supabase aceita arquivos grandes, mas pode ser lento
- Divida o SQL em partes se der timeout

---

## 🆘 Se Ainda Não Funcionar

1. Verifique se o dump não está corrompido
2. Tente usar o **Connection Pooler** (porta 6543)
3. Entre em contato com o suporte do Supabase
4. Considere usar outro banco temporariamente (Neon, Railway)
