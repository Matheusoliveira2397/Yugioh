# 🔧 Solução: Supabase IPv6-Only

## ❓ O Problema

Se o Supabase está em modo **IPv6-only**, conexões IPv4 serão bloqueadas. Isso pode impedir:
- `pg_restore` do Docker
- Conexões diretas do Windows
- Scripts de migração

## ✅ Soluções

### **Opção 1: Habilitar IPv4 no Supabase (Recomendado)**

1. Acesse o **Supabase Dashboard**
2. Vá em **Settings** > **Database**
3. Procure por **Connection Pooling** ou **Network Settings**
4. Verifique se há opção para habilitar **IPv4**
5. Se disponível, habilite e aguarde alguns minutos

**Nota:** Alguns planos do Supabase podem não ter essa opção.

---

### **Opção 2: Configurar Docker para IPv6**

#### **2.1 Verificar se Windows tem IPv6**

```powershell
# Verificar se IPv6 está habilitado
Get-NetAdapterBinding -ComponentID ms_tcpip6 | Select-Object Name, Enabled

# Verificar endereço IPv6
ipconfig /all | Select-String "IPv6"
```

#### **2.2 Habilitar IPv6 no Docker Desktop**

1. Abra **Docker Desktop**
2. Vá em **Settings** > **Resources** > **Network**
3. Marque **Enable IPv6**
4. Clique em **Apply & Restart**

#### **2.3 Testar Conexão IPv6**

```powershell
# Testar resolução DNS IPv6
nslookup db.apoiwxotlrxmtirgchox.supabase.co

# Testar conexão IPv6
Test-NetConnection -ComputerName db.apoiwxotlrxmtirgchox.supabase.co -Port 5432
```

---

### **Opção 3: Converter Dump para SQL (Mais Confiável)**

Se IPv6 não funcionar, converta o dump para SQL e importe via **SQL Editor** do Supabase:

#### **3.1 Converter Dump para SQL**

```powershell
# Usar Docker para converter
docker run --rm `
    -v "${PWD}:/backup:ro" `
    postgres:16 `
    pg_restore -Fc -l "/backup/yugioh_backup_*.dump" > backup-list.txt

# Converter para SQL
docker run --rm `
    -v "${PWD}:/backup" `
    postgres:16 `
    pg_restore -Fc -f "/backup/backup.sql" "/backup/yugioh_backup_*.dump"
```

#### **3.2 Importar via SQL Editor**

1. Acesse **Supabase Dashboard** > **SQL Editor**
2. Abra o arquivo `backup.sql`
3. Execute seção por seção (pode ser grande)
4. Ou use o script automatizado abaixo

---

### **Opção 4: Usar Connection Pooler (IPv4)**

O Supabase oferece um **Connection Pooler** que pode aceitar IPv4:

```
# Connection String com Pooler (porta 6543)
postgresql://postgres.xxxxxx:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
```

**Nota:** O pooler pode ter limitações para `pg_restore`. Teste primeiro.

---

## 🚀 Script Automatizado

Use o script `restore-supabase-ipv6.ps1` que tenta todas as opções automaticamente.

---

## 📋 Checklist

- [ ] Verificar se Supabase tem opção IPv4
- [ ] Habilitar IPv6 no Docker Desktop
- [ ] Testar conexão IPv6
- [ ] Se falhar, converter dump para SQL
- [ ] Importar via SQL Editor do Supabase

---

## 🔍 Verificar Qual É o Problema

Execute este comando para diagnosticar:

```powershell
# Testar resolução DNS
nslookup db.apoiwxotlrxmtirgchox.supabase.co

# Testar conexão
Test-NetConnection -ComputerName db.apoiwxotlrxmtirgchox.supabase.co -Port 5432

# Verificar se Docker tem IPv6
docker network inspect bridge | Select-String "IPv6"
```

Se todos falharem, use a **Opção 3** (converter para SQL).
