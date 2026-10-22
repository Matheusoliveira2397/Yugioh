# Direção de arte — Duelist Academy (outubro/2026)

## Referências visuais (inspiração, não cópia)
- **Yu-Gi-Oh! Tag Force**: atmosfera de academia, progresso de duelista e exploração do modo história.
- **Yu-Gi-Oh! Master Duel**: leitura limpa de informações de cartas e hierarquia entre ações primárias/secundárias.
- **Yu-Gi-Oh! Duel Links**: ações rápidas e navegação compreensível em telas pequenas.
- **Moldura da carta clássica**: bordas douradas, contraste de superfícies e sensação de item colecionável. Não reproduzir ativos protegidos de terceiros; usar artes e arquivos cuja licença foi verificada.

## Tokens de cor
- Fundo profundo: `#07090f` e superfícies `#0c1220`, `#121a2e`.
- Ação / conquista: ouro `#e8c547`, contraste em `#f2cf70`.
- Informação / progresso: ciano `#3db8c5`.
- Perigo / confirmação destrutiva: vermelho `#c43c3c`.
- Texto: branco quente sobre superfícies escuras; conteúdo auxiliar no mínimo `#bfcae0`.

## Hierarquia
1. Título da tela e objetivo imediatos em painel `game-screen-hero`.
2. Ação primária única em destaque, com pelo menos 44 px de área interativa.
3. Cards de conteúdo com borda sutil, contraste alto e espaços regulares.
4. Informação complementar na sidebar e no rodapé.
5. Modais de duelo e tabuleiro não devem receber estilos globais sem verificação.

## Ícones
`frontend/src/components/GameIcon.tsx` mapeia **rotas**, não textos traduzidos, para manter consistência entre idiomas.

| Rota | Referência semântica |
| --- | --- |
| `/home` | casa / central |
| `/random-duel` | espadas cruzadas |
| `/arena` | escudo / estrela |
| `/tournaments` | troféu |
| `/deck-builder` | baralho |
| `/collection` | coleção de cartas |
| `/shop` | sacola |
| `/ranking` | pódio |
| `/missions` | prancheta |
| `/story` | livro / narrativa |
| `/battle-pass` | passe |
| `/loot-boxes` | caixa |
| `/groups` | grupo de duelistas |
| `/chat` | conversa |
| `/credit` | moeda |
| `/help` | ponto de interrogação |

Evitar ícone PNG sem fallback em navegação essencial. SVG com `currentColor` permanece visível no zoom e em telas de alta densidade. Ícones decorativos devem estar com `aria-hidden`; links e botões mantêm rótulo textual.

## Cobertura desta iteração
- **Todas as telas autenticadas** recebem refinamento das superfícies compartilhadas, contraste, inputs, foco de teclado, navegação desktop/mobile e estados ativos.
- Cabeçalhos e ícones atualizados individualmente: home, login, loja, ranking, torneios, coleção, construção de decks e modo história.
- Cadastro conserva a revisão visual do PR #12; a lógica de autenticação e regras de duelo não foram alteradas.
- `GameIcon` cobre também rotas de menu configuradas no banco com ícones antigos, evitando sumiço caso a imagem esteja ausente.

## Checklist de homologação visual
- Desktop: 1280px, 1440px, 1920px; navegador 100% e 200%.
- Tablet: 768px e 1024px, navegação rolável horizontalmente.
- Mobile: 320px, 375px, 430px; menu expandido, toque de 44px e rolagem.
- Testar todos os destinos do menu, rotas profundas e tradução para outros idiomas.
- Confirmar que cards, avatar, fundos e artes de cartas carregam com URLs reais em produção.
- Validar contraste, foco do teclado, texto truncado e preferência por menos animações.
- Duelos: verificar separadamente HUD, cartas, prompts de efeito e resoluções de turno.
- Revisar em etapa seguinte os componentes complexos de administração, editor de cartas e Arena de Duelos, sem regressão de engine.

Não considerar a modernização de **cada componente interno** concluída somente porque o shell é compartilhado. O padrão e os principais pontos de entrada foram migrados; módulos extensos ainda precisam de auditoria visual tela a tela.
