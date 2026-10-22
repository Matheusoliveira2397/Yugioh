# Redesign visual e nitidez das cartas

## Implementação
- Home: seção de destaque com ações primárias para duelo e modo história, cartões de navegação revisados.
- Loja: cabeçalho mais legível, molduras de cartas com proporção real e botão de visualização ampliada nas informações.
- Deck: cabeçalho com hierarquia visual melhor, opção de ampliar a capa.
- Duelos: cabeçalho mobile com contraste e foco de teclado, sem mudanças nas regras ou zonas.
- Componentes compartilhados: estados de foco visíveis, botões e molduras consistentes, respeito a `prefers-reduced-motion`.
- Imagens: `CardImage` usa `object-fit: contain` por padrão para preservar a arte inteira; o visor em tamanho maior usa o arquivo original disponível.
- Administração: medição das dimensões locais da imagem selecionada, com aviso não bloqueante quando inferior a 800 × 1160 px.

## Qualidade da imagem (limite importante)
CSS e ampliação **não criam pixels que não existem no arquivo original**. Para arte originalmente pequena/embaçada, substituir o arquivo por uma versão de resolução superior. Não há super-resolução sintética ou alteração automática das imagens existentes.

## Plano de aceitação
1. CI: `frontend npm run build:check`, `backend npm run build` e testes existentes.
2. Inspeção manual Home, Loja, Deck e Duel em desktop e celular.
3. Validar cartas de raridades diferentes, cartas sem imagem, imagens carregadas via `/uploads/cards`, cache e atualização de imagem.
4. Verificar leitor de tela/teclado no visor da carta e preferências de movimento reduzido.
5. Verificar 1 duelo completo e navegação Loja → Detalhe → Ampliar → Voltar.

## Não incluído
Substituição dos arquivos de arte originais e refatoração do motor de duelos. CI verde não equivale a validação visual nem de gameplay completa.
