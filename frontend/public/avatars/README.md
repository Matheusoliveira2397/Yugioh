# 📁 Pasta de Avatares (Assets Estáticos do Projeto)

## ⚠️ IMPORTANTE:

Esta pasta contém **APENAS IMAGENS ESTÁTICAS** do projeto (backgrounds, avatares padrão, etc).

**O que NÃO vai aqui:**
- ❌ Imagens enviadas pelos usuários
- ❌ Uploads personalizados
- ❌ Fotos de perfil customizadas

**O que vai aqui:**
- ✅ Avatares pré-definidos do jogo (personagens)
- ✅ Imagem padrão do sistema
- ✅ Backgrounds e assets visuais

## Como Funciona:

### **Sistema de Avatares:**

1. **Banco de Dados**: Salva apenas o **CAMINHO** da imagem
   - Exemplo: `/avatars/default/avatar-1.png`
   - Exemplo: `https://cdn.example.com/user-upload.jpg` (upload externo futuro)

2. **Esta Pasta**: Contém apenas imagens estáticas pré-definidas
   - Avatares de personagens do Yu-Gi-Oh
   - Imagem padrão do sistema
   - Não crescerá com uploads de usuários

3. **Uploads Futuros**: Serão salvos em serviços externos
   - AWS S3, Cloudinary, Firebase Storage, etc.
   - O banco salva apenas a URL: `https://s3.amazonaws.com/yugioh/avatars/user123.jpg`

---

## 📂 Estrutura:

### **1. Avatar Padrão** (`/avatars/default.png`)
- Imagem usada para novos usuários
- Atualmente: Millennium Puzzle (SVG)

### **2. Avatares Selecionáveis** (`/avatars/default/`)
Personagens pré-definidos que os jogadores podem escolher:

**Sugestões:**
- `avatar-1.png` - Yugi Muto
- `avatar-2.png` - Seto Kaiba
- `avatar-3.png` - Joey Wheeler
- `avatar-4.png` - Mai Valentine
- `avatar-5.png` - Pegasus
- `avatar-6.png` - Bakura
- `avatar-7.png` - Marik
- `avatar-8.png` - Ishizu

**Requisitos:**
- Formato: PNG ou JPG
- Tamanho: 200x200px ou 300x300px
- Peso: máximo 200KB
- Estas imagens são **permanentes** no projeto

### **3. Backgrounds** (`/avatars/backgrounds/`) - *Futuro*
Imagens de fundo para a interface

---

## 🎨 Onde Encontrar Imagens:

1. **Pinterest**: Busque "yugioh character avatar"
2. **DeviantArt**: Muitos artistas fazem avatares de Yu-Gi-Oh
3. **Google Images**: "yugioh duel links avatar" (são quadrados e perfeitos)
4. **Fazer você mesmo**: Use sites como:
   - https://www.canva.com
   - https://www.photopea.com (Photoshop online grátis)

---

## 📋 Checklist:

- [ ] Adicionar `default.png` em `/avatars/`
- [ ] Adicionar 8-10 avatares padrão em `/avatars/default/`
- [ ] Todas as imagens em formato PNG ou JPG
- [ ] Tamanho aproximado de 200x200px
- [ ] Peso máximo de 200KB cada
