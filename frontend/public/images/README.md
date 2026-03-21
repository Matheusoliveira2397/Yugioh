# Pasta de Imagens do Projeto

Esta pasta contém todas as imagens utilizadas no projeto Yu-Gi-Oh!

## Avatar padrão (perfil)

- **`default.jpg`** — usado para contas sem foto de perfil (`/images/default.jpg`). O backend grava esse path no cadastro; mantenha o arquivo nesta pasta.
- Ao **trocar** a arte: substitua `default.jpg` e incremente `?v=` em `frontend/src/utils/imageUrl.ts` (`DEFAULT_PROFILE_IMAGE_PATH`) para o app não usar imagem em cache. Reinicie o backend para ele sincronizar o arquivo para `uploads/avatars` e `uploads/images`.

## Fundos da arena e do login

Coloque **um** arquivo com o nome base (sem extensão duplicada no código):

- `public/images/background` — duelo (`DuelArena`)
- `public/images/backgroundLogin` — layout logado + telas de login/cadastro/recuperação

O app tenta automaticamente, nesta ordem: `.webp`, `.jpg`, `.jpeg`, `.png`, `.avif`, `.gif`, `.bmp`, `.svg`.

## Estrutura:

- **`/cards`** - Imagens das cartas de Yu-Gi-Oh
- **`/decks`** - Imagens relacionadas a decks (leques de cartas, fundos, etc)
- **`/banners`** - Banners e imagens de destaque
- **`/icons`** - Ícones e pequenas imagens

## Como usar:

Coloque suas imagens nas pastas correspondentes e acesse no código:

```tsx
<img src="/images/decks/sua-imagem.jpg" alt="Descrição" />
```

Ou para cartas:

```tsx
<img src="/images/cards/dragao-branco.png" alt="Dragão Branco de Olhos Azuis" />
```
