# Subir novas cartas para o servidor

Existem duas partes: **imagens das cartas** e **registros no banco** (dados da carta). Depende de como você adicionou as cartas.

---

## 1. Só imagens novas (arquivos em `frontend/public/images/cards/`)

Se você só colocou arquivos (ex: `YGOPRO_12345.jpg`) na pasta **frontend/public/images/cards/**:

### No seu PC (já feito se você deu push)
```bash
git add frontend/public/images/cards/
git add backend/ frontend/   # se tiver outras alterações
git commit -m "Novas imagens de cartas"
git push origin main
```

### No servidor
```bash
cd /caminho/do/projeto/Yugioh   # pasta do repositório no servidor

# Atualizar código (inclui as novas imagens)
git pull origin main
```

Depois, **reconstruir e reiniciar** a aplicação para o servidor passar a servir as novas imagens:

- **Docker:**
  ```bash
  docker-compose -f docker-compose.prod.yml build --no-cache frontend
  docker-compose -f docker-compose.prod.yml up -d
  ```
  Se as imagens de cartas vêm de um volume apontando para a pasta do repo, às vezes basta `git pull` e reiniciar os containers (sem rebuild do frontend, depende do seu `docker-compose`).

- **Deploy manual (PM2 etc.):**
  ```bash
  cd frontend
  npm run build
  # Reiniciar o que servir o frontend (ex: PM2, nginx)
  ```

Assim as **novas imagens** passam a estar disponíveis em produção (ex: `https://seu-dominio.com/images/cards/YGOPRO_12345.jpg`).

---

## 2. Cartas criadas no Admin (banco de dados)

Se você **criou/alterou cartas pelo painel Admin** (nome, tipo, preço, efeito, etc.), isso fica no **banco de dados local**. O servidor tem outro banco (produção), então esses registros não sobem só com `git push`.

Opções:

### Opção A – Criar de novo no servidor (mais simples)
1. Acesse o **Admin no servidor** (produção).
2. Vá em **Gerenciamento de cartas**.
3. Crie cada carta de novo (nome, tipo, imagem, preço, etc.).
4. Use **“Upload de imagem”** e envie o arquivo da carta, ou use o mesmo nome de arquivo que está em `frontend/public/images/cards/` (ex: `YGOPRO_12345.jpg`) se as imagens já tiverem sido colocadas no servidor (via git pull + deploy).

### Opção B – Exportar/importar só a tabela de cartas
Se você tiver acesso ao banco local e ao banco do servidor:

1. **No seu PC** (banco local), exportar a tabela de cartas, por exemplo:
   ```bash
   pg_dump -h localhost -U postgres -t cards -a nome_do_banco > cards_export.sql
   ```
2. No servidor, importar (ajustando usuário e nome do banco):
   ```bash
   psql -h localhost -U postgres nome_do_banco_producao < cards_export.sql
   ```
3. Fazer **git pull** no servidor (para ter as imagens em `frontend/public/images/cards/`) e **reconstruir/reiniciar** como no item 1.

---

## Resumo rápido

| O que você fez | O que fazer |
|----------------|-------------|
| Só colocou arquivos em `frontend/public/images/cards/` | `git push` (já feito) → no servidor: **git pull** + **rebuild/redeploy** |
| Criou cartas no Admin (banco) | No servidor: **criar as cartas de novo no Admin** ou **exportar/importar a tabela de cartas** + garantir que as imagens estejam no servidor (git pull + deploy) |

Se disser como você sobe o projeto no servidor (Docker, VPS manual, etc.), dá para detalhar os comandos exatos para o seu caso.
