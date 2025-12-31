/**
 * Normaliza o nome da carta para corresponder ao nome do arquivo
 * Remove espaços, caracteres especiais e converte para formato PascalCase
 * Exemplo: "Thestalos The Firestorm Monarch" -> "ThestalosTheFirestormMonarch"
 * Exemplo: "White Magical Hat" -> "WhiteMagicalHat"
 * Exemplo: "Harpie's Feather Duster" -> "HarpiesFeatherDuster"
 * 
 * NOTA: Alguns arquivos mantêm o apóstrofe (ex: Harpie'sFeatherDuster.jpg)
 * Então também tentamos variações com apóstrofe
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
 * Gera variações do nome da carta para buscar arquivos com diferentes formatos
 * Exemplo: "HarpiesFeatherDuster" -> ["HarpiesFeatherDuster", "Harpie'sFeatherDuster"]
 */
const generateCardNameVariations = (name: string): string[] => {
  if (!name) return [];
  
  const variations: string[] = [name]; // Incluir o nome original
  
  // Se o nome normalizado contém "Harpies" (sem apóstrofe), tentar com apóstrofe
  if (name.includes('Harpies') && !name.includes("'")) {
    variations.push(name.replace('Harpies', "Harpie's"));
  }
  
  // Se o nome contém "Harpie's" (com apóstrofe), tentar sem apóstrofe
  if (name.includes("Harpie's")) {
    variations.push(name.replace("Harpie's", 'Harpies'));
  }
  
  return variations;
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
  
  // Retornar array de caminhos possíveis (jpg, jpeg, png, webp)
  // PRIORIDADE: Tentar nome exato primeiro, depois normalizado, depois variações
  const paths: string[] = [];
  
  // 1. Tentar nome exato primeiro (mais comum - idCarta já está no formato correto)
  paths.push(`/images/cards/${idStr}.jpg`);
  paths.push(`/images/cards/${idStr}.jpeg`);
  paths.push(`/images/cards/${idStr}.png`);
  paths.push(`/images/cards/${idStr}.webp`);
  
  // 2. Se o nome original tiver espaços ou caracteres especiais, normalizar e tentar
  const normalized = normalizeCardName(idStr);
  if (idStr !== normalized && normalized) {
    paths.push(`/images/cards/${normalized}.jpg`);
    paths.push(`/images/cards/${normalized}.jpeg`);
    paths.push(`/images/cards/${normalized}.png`);
    paths.push(`/images/cards/${normalized}.webp`);
  }
  
  // 3. Gerar variações (ex: HarpiesFeatherDuster -> Harpie'sFeatherDuster)
  const variations = generateCardNameVariations(idStr);
  for (const variation of variations) {
    if (variation !== idStr && variation !== normalized) {
      paths.push(`/images/cards/${variation}.jpg`);
      paths.push(`/images/cards/${variation}.jpeg`);
      paths.push(`/images/cards/${variation}.png`);
      paths.push(`/images/cards/${variation}.webp`);
    }
  }
  
  // 4. Também tentar variações do nome normalizado
  if (normalized) {
    const normalizedVariations = generateCardNameVariations(normalized);
    for (const variation of normalizedVariations) {
      if (variation !== idStr && variation !== normalized && !paths.includes(`/images/cards/${variation}.jpg`)) {
        paths.push(`/images/cards/${variation}.jpg`);
        paths.push(`/images/cards/${variation}.jpeg`);
        paths.push(`/images/cards/${variation}.png`);
        paths.push(`/images/cards/${variation}.webp`);
      }
    }
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
  // Verificar se cardImage existe e não é vazio/null
  const cardImage = card?.cardImage;
  
  // Debug temporário
  if (!card?.idCarta && !cardImage) {
    console.warn('[getCardImage] Carta sem idCarta e sem cardImage:', card?.name, card);
  }
  
  // Se cardImage existir e não for vazio, usar esse valor
  if (cardImage && typeof cardImage === 'string' && cardImage.trim() !== '') {
    // Se for um caminho relativo do backend (começa com /uploads/), construir URL completa
    if (cardImage.startsWith('/uploads/')) {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      return `${API_URL}${cardImage}`;
    }
    
    // Se já for uma URL completa (http:// ou https://), usar diretamente
    if (cardImage.startsWith('http://') || cardImage.startsWith('https://')) {
      return cardImage;
    }
    
    // Se for um caminho relativo do frontend (começa com /images/), usar diretamente
    if (cardImage.startsWith('/images/')) {
      return cardImage;
    }
    
    // Caso contrário, assumir que é um caminho relativo do backend
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    return `${API_URL}${cardImage.startsWith('/') ? cardImage : '/' + cardImage}`;
  }
  
  // Se cardImage não existir ou for vazio, tentar usar o ID da carta para buscar a imagem local
  // Prioridade: idCarta (campo usado pelo backend), depois id, depois cardId
  const cardId = card?.idCarta || card?.id || card?.cardId;
  if (cardId) {
    return getCardImagePath(cardId);
  }
  
  return null;
};

