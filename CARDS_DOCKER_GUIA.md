# Guia: Onde as Cartas Estão Sendo Salvas no Docker

## Problema Identificado

As cartas estão sendo salvas dentro do container Docker, mas não há volume mapeado no `docker-compose.prod.yml` para salvar no servidor. Isso significa que as imagens ficam apenas dentro do container e são perdidas quando o container é recriado.

## Solução Implementada

### 1. Volume Mapeado Adicionado

Foi adicionado o volume mapeado no `docker-compose.prod.yml`:

```yaml
volumes:
  - ./backend/uploads:/app/uploads
  - ./backend/logs:/app/logs
  - ./frontend/public/images/cards:/app/frontend-cards  # ✅ NOVO
```

Agora as cartas serão salvas em `./frontend/public/images/cards` no servidor (fora do Docker).

## Onde as Cartas Estão Sendo Salvas

### No Container Docker (Backend)
- **Caminho no container**: `/app/frontend-cards`
- **Caminho no servidor**: `./frontend/public/images/cards` (mapeado via volume)
- **Backup no container**: `/app/uploads/cards`

### No Servidor (Fora do Docker)
- **Caminho principal**: `./frontend/public/images/cards`
- **Backup**: `./backend/uploads/cards`

## Como Verificar Onde as Cartas Estão

### 1. Usando o Script PowerShell

Execute o script para verificar onde as cartas estão:

```powershell
.\scripts\verificar-cartas-docker.ps1
```

Este script irá:
- Verificar se o Docker está rodando
- Encontrar o container do backend
- Listar as cartas dentro do container
- Mostrar os volumes mapeados
- Verificar se as pastas existem no servidor

### 2. Verificar Manualmente no Container

```powershell
# Listar cartas no container
docker exec yugioh-backend-prod ls -la /app/frontend-cards

# Contar quantas cartas existem
docker exec yugioh-backend-prod sh -c "ls -1 /app/frontend-cards | wc -l"

# Verificar se a pasta existe
docker exec yugioh-backend-prod test -d /app/frontend-cards && echo "EXISTS" || echo "NOT_EXISTS"
```

### 3. Verificar no Servidor

```powershell
# Verificar se a pasta existe no servidor
Test-Path .\frontend\public\images\cards

# Listar cartas no servidor
Get-ChildItem .\frontend\public\images\cards

# Contar cartas no servidor
(Get-ChildItem .\frontend\public\images\cards).Count
```

### 4. Verificar Volumes Mapeados

```powershell
# Ver todos os volumes mapeados no container
docker inspect yugioh-backend-prod --format '{{json .Mounts}}' | ConvertFrom-Json | Format-Table
```

## Como Copiar Cartas do Container para o Servidor

Se as cartas estiverem apenas no container (antes da correção), você pode copiá-las:

```powershell
# Criar a pasta no servidor se não existir
New-Item -ItemType Directory -Force -Path .\frontend\public\images\cards

# Copiar todas as cartas do container para o servidor
docker cp yugioh-backend-prod:/app/frontend-cards/. ./frontend/public/images/cards/

# Ou copiar do backup
docker cp yugioh-backend-prod:/app/uploads/cards/. ./frontend/public/images/cards/
```

## Após Aplicar a Correção

1. **Reiniciar o container do backend**:
   ```powershell
   docker-compose -f docker-compose.prod.yml restart backend
   ```

2. **Verificar se o volume está mapeado corretamente**:
   ```powershell
   docker inspect yugioh-backend-prod --format '{{json .Mounts}}' | ConvertFrom-Json
   ```

3. **Testar salvando uma nova carta** e verificar se aparece em:
   - `./frontend/public/images/cards` no servidor
   - `/app/frontend-cards` no container

## Estrutura de Pastas Esperada

```
Yugioh/
├── backend/
│   └── uploads/
│       └── cards/          # Backup das cartas
├── frontend/
│   └── public/
│       └── images/
│           └── cards/       # ✅ Cartas principais (acessíveis pelo frontend)
└── docker-compose.prod.yml
```

## Notas Importantes

1. **As cartas devem estar em `frontend/public/images/cards`** para serem acessíveis pelo frontend via `/images/cards/`.

2. **O volume mapeado garante persistência**: Mesmo que o container seja recriado, as cartas permanecerão no servidor.

3. **Backup automático**: O código também salva uma cópia em `/app/uploads/cards` dentro do container como backup.

4. **Em produção**: Certifique-se de que o servidor web (Nginx, Apache, etc.) está configurado para servir arquivos de `./frontend/public/images/cards` na rota `/images/cards/`.

## Troubleshooting

### Cartas não aparecem no servidor

1. Verifique se o volume está mapeado:
   ```powershell
   docker inspect yugioh-backend-prod --format '{{json .Mounts}}'
   ```

2. Verifique se a pasta existe no servidor:
   ```powershell
   Test-Path .\frontend\public\images\cards
   ```

3. Verifique permissões da pasta:
   ```powershell
   Get-Acl .\frontend\public\images\cards
   ```

### Cartas não aparecem no frontend

1. Verifique se o caminho está correto: `/images/cards/nome_do_arquivo.jpg`
2. Verifique se o servidor web está servindo a pasta correta
3. Verifique os logs do backend para ver onde está tentando salvar:
   ```powershell
   docker logs yugioh-backend-prod | Select-String "frontend-cards"
   ```


