/**
 * Normaliza o nome da carta para corresponder ao nome do arquivo
 * Remove espaços, caracteres especiais e converte para formato PascalCase
 * Exemplo: "Thestalos The Firestorm Monarch" -> "ThestalosTheFirestormMonarch"
 * Exemplo: "White Magical Hat" -> "WhiteMagicalHat"
 * Exemplo: "Harpie's Feather Duster" -> "HarpiesFeatherDuster"
 */
const normalizeCardName = (name: string): string => {
  if (!name) return '';
  
  // Remover espaços e caracteres especiais, manter apenas letras e números
  // Converter para PascalCase (primeira letra de cada palavra em maiúscula)
  const normalized = name
    .trim()
    .split(/[\s\-_'"]+/) // Divide por espaços, hífens, underscores, aspas
    .map(word => {
      // Manter apenas letras e números
      const cleaned = word.replace(/[^a-zA-Z0-9]/g, '');
      if (!cleaned) return '';
      // Primeira letra maiúscula, resto minúscula
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    })
    .filter(word => word.length > 0) // Remove strings vazias
    .join(''); // Junta tudo sem espaços
  
  // Debug removido para reduzir spam de logs
  // console.log(`[normalizeCardName] "${name}" -> "${normalized}"`);
  
  return normalized;
};

/**
 * Função utilitária para obter o caminho da imagem de uma carta baseado no ID
 * As imagens ficam em frontend/public/images/cards/
 * Retorna array de caminhos possíveis para tentar diferentes extensões
 */
export const getCardImagePaths = (cardId: string | number | undefined | null): string[] => {
  if (!cardId) return [];
  
  // Converter ID para string
  const idStr = String(cardId);
  
  // Retornar array de caminhos possíveis (jpg, png, webp)
  // PRIORIDADE: Tentar nome exato primeiro, depois normalizado
  const paths: string[] = [];
  
  // 1. Tentar nome exato primeiro (mais comum - idCarta já está no formato correto)
  paths.push(`/images/cards/${idStr}.jpg`);
  paths.push(`/images/cards/${idStr}.png`);
  paths.push(`/images/cards/${idStr}.webp`);
  
  // 2. Se o nome original tiver espaços ou caracteres especiais, normalizar e tentar
  const normalized = normalizeCardName(idStr);
  if (idStr !== normalized && normalized) {
    paths.push(`/images/cards/${normalized}.jpg`);
    paths.push(`/images/cards/${normalized}.png`);
    paths.push(`/images/cards/${normalized}.webp`);
  }
  
  return paths;
};

/**
 * Função utilitária para obter o primeiro caminho possível da imagem
 * (para compatibilidade com código existente)
 */
export const getCardImagePath = (cardId: string | number | undefined | null): string | null => {
  const paths = getCardImagePaths(cardId);
  return paths.length > 0 ? paths[0] : null;
};

/**
 * Função para obter a imagem da carta, com fallback
 * Retorna o caminho da imagem local se disponível, ou null para usar fallback
 */
export const getCardImage = (card: any): string | null => {
  // Se a carta já tem cardImage (URL), não substituir
  // Mas se não tiver, usar o ID para buscar localmente
  if (card?.cardImage) {
    return card.cardImage;
  }
  
  // Tentar usar o ID da carta para buscar a imagem local
  // Prioridade: idCarta (campo usado pelo backend), depois id, depois cardId
  const cardId = card?.idCarta || card?.id || card?.cardId;
  if (cardId) {
    return getCardImagePath(cardId);
  }
  
  return null;
};

