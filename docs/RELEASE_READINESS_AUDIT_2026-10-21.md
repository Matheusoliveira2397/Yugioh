# Auditoria de lançamento — 21/10/2026

## Escopo executado
- Inspecionada a árvore de arquivos da branch main (917 arquivos versionados no momento da auditoria).
- Lidos scripts de build, configurações TypeScript, sistema de bots e loot boxes.
- Removidos arquivos de rascunho antigos da loja e log histórico do backend.
- Incluído GitHub Actions que executa: frontend `npm ci && npm run build:check`; backend `npm ci && npm run build && npm test -- --runInBand --passWithNoTests`.

## Bloqueadores de lançamento (priorizados)

### P0 — Não lançar sem estes itens
1. **Build e testes verificados em CI.** O GitHub tinha workflow apenas para criação de volume Fly; Cloudflare Pages bem-sucedido não demonstra build/testes de backend.
2. **Migrações controladas por ambiente.** O TypeORM usa `synchronize: false` e o projeto distribui migrações SQL em vários diretórios. Implantação deve executar migrações versionadas com backup e plano de rollback; não executar scripts indiscriminadamente.
3. **Compra/loot boxes: teste concorrente e idempotência.** Verificar simultaneidade, saldo, capacidade da maleta, auditoria, erros após pagamento e recuperação. O fluxo atual precisa de teste de integração real no PostgreSQL.
4. **Motor de duelo e bots:** simular partidas completas, efeitos pendentes, erros de socket, reconexão, timeout e múltiplas instâncias de servidor.
5. **Segurança operacional:** revisar variáveis e segredos, CORS, autenticação JWT/WebSocket, permissões MASTER, limites de requisições, backup/restore, logging de dados sensíveis e dependências vulneráveis.

### P1 — Recomendados antes de um lançamento público amplo
1. Testes de integração para cadastro, login, recuperação de senha, decks, loja, pagamento, inventário, torneios e rankings.
2. Testes e2e de páginas principais e dispositivos móveis.
3. Health checks, alertas, métricas, tratamento centralizado de erros e logs estruturados.
4. Ensaio de carga de WebSocket, matchmaking, banco e Redis; checar lock distribuído para jobs recorrentes.
5. Revisão jurídica e de propriedade intelectual sobre nome, imagens, textos e cartas Yu-Gi-Oh!, bem como as regras aplicáveis a caixas aleatórias pagas e publicação para menores.

### P2 — Dívida técnica, após cobertura de testes
1. Separar `duels.service.ts` e `duels.gateway.ts` gigantes por casos de uso, preservando contratos existentes.
2. Configurar detectores de imports/exports mortos (`tsc --noUnusedLocals`, ESLint, ferramenta específica), mas **não remover métodos públicos pelo nome** sem checar uso dinâmico por NestJS/decorators e WebSocket.
3. Consolidar scripts históricos de deploy e migrações **somente depois** de identificar a estratégia de produção e restauração.
4. Cobertura de testes para bots e cálculo das probabilidades de loot boxes.

## Limites da auditoria
Não foi realizado `npm ci`, build local, execução do banco nem teste end-to-end. A branch contém apenas limpeza conservadora e implantação de CI; não representa certificação de prontidão nem exclusão exaustiva de classes/métodos não utilizados.
