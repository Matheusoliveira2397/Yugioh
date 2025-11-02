# 🎭 Sistema de Avatares - Guia Rápido

## ✨ O que foi implementado:

### 1. **Card de Perfil no Canto Superior Direito**
- ✅ Aparece em todas as páginas após login
- ✅ Mostra: Nickname, Avatar, Rating, Vitórias, Derrotas e Gemas
- ✅ Animações e hover effects
- ✅ Badge verde de "Online"
- ✅ Clicável para ir ao perfil

### 2. **Página de Perfil Completa** (`/profile`)
- ✅ Preview do avatar atual
- ✅ Informações completas do duelista
- ✅ Grid de avatares disponíveis para escolher
- ✅ Botão de salvar avatar
- ✅ Feedback visual de sucesso/erro

### 3. **Backend**
- ✅ Campo `avatar` adicionado no banco de dados
- ✅ Endpoint `PATCH /users/:id/avatar` para atualizar
- ✅ Avatar padrão `/avatars/default.png` para novos usuários
- ✅ Avatar retornado no login

## 📁 Estrutura de Pastas Criada:

```
frontend/public/
└── avatars/
    ├── default.png          ← Avatar padrão (Millennium Puzzle)
    ├── README.md            ← Instruções
    └── default/             ← Pasta para avatares selecionáveis
        ├── avatar-1.png     ← Adicione aqui!
        ├── avatar-2.png
        ├── avatar-3.png
        └── ...
```

## 🎨 Como Adicionar Novos Avatares:

### **Método 1: Baixar da Internet**
1. Pesquise no Google: "yugioh character avatar png"
2. Baixe imagens de personagens (Yugi, Kaiba, Joey, Mai, etc.)
3. Salve na pasta `frontend/public/avatars/default/`
4. Nomeie como: `avatar-1.png`, `avatar-2.png`, etc.

### **Método 2: Criar Você Mesmo**
1. Use o Canva ou Photopea
2. Crie imagens 200x200px
3. Exporte como PNG
4. Salve na pasta `default/`

### **Recomendações:**
- **Formato**: PNG com fundo transparente (melhor) ou JPG
- **Tamanho**: 200x200px ou 300x300px
- **Peso**: Máximo 200KB por imagem
- **Estilo**: Quadradas, preferencialmente redondas ficam melhores

## 🚀 Como Testar:

1. **Limpe o banco** (para adicionar o campo avatar):
   ```powershell
   docker exec yugioh-postgres psql -U yugioh_user -d yugioh_db -c "DELETE FROM users;"
   ```

2. **Cadastre uma nova conta**:
   - Acesse: http://localhost:5173/register
   - Preencha os dados
   - Cadastre-se

3. **Faça login**:
   - Você verá o **card de perfil no canto superior direito**!
   - Avatar padrão (Millennium Puzzle) estará visível

4. **Clique no card de perfil** ou acesse: http://localhost:5173/profile

5. **Escolha um novo avatar**:
   - Clique em qualquer avatar disponível
   - Clique em "Salvar Avatar"
   - Veja a mudança instantânea!

## 📸 Sugestões de Avatares para Adicionar:

### Personagens Principais:
1. **Yugi Muto** - Protagonista
2. **Seto Kaiba** - Rival
3. **Joey Wheeler** - Amigo
4. **Téa Gardner** - Amiga
5. **Mai Valentine** - Duelista
6. **Maximillion Pegasus** - Vilão
7. **Yami Bakura** - Vilão
8. **Marik Ishtar** - Vilão

### Onde Encontrar:
- **Pinterest**: "yugioh duel links avatar"
- **DeviantArt**: "yugioh character icon"
- **Google Images**: Use filtro "Tamanho: Grande" e "Tipo: PNG"

## 🛠️ Melhorias Futuras:

- [ ] Upload de imagem personalizada do computador
- [ ] Avatares desbloqueáveis por conquistas
- [ ] Avatares premium compráveis com gemas
- [ ] Molduras de avatar especiais
- [ ] Animação de brilho em avatares raros
- [ ] Sistema de badges/emblemas no perfil

---

## 💡 Dica Importante:

Se você adicionar novos avatares na pasta `default/`, eles aparecerão automaticamente na página de perfil! Não precisa reiniciar nada, basta atualizar a página! 🎉
