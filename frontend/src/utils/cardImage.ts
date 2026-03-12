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
 * Gera caminhos possíveis baseados no nome da carta
 * Formato: card_nome_da_carta_timestamp.extensão
 * Mas também tenta variações sem timestamp e com nome normalizado
 */
const getCardNameBasedPaths = (cardName: string): string[] => {
  if (!cardName) return [];
  
  const paths: string[] = [];
  const extensions = ['.jpg', '.jpeg', '.png', '.webp'];
  
  // 1. Nome sanitizado (lowercase com underscores) com prefixo "card_" - formato mais comum nos arquivos
  // Formato: card_marshmallon_1769332490741.jpg
  const sanitized = cardName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (sanitized) {
    // Tentar com prefixo "card_" (formato mais comum nos arquivos salvos)
    for (const ext of extensions) {
      paths.push(`/images/cards/card_${sanitized}${ext}`);
    }
  }
  
  // 2. Nome normalizado (PascalCase) - formato alternativo
  const normalized = normalizeCardName(cardName);
  if (normalized && normalized.toLowerCase().replace(/[^a-z0-9]/g, '_') !== sanitized) {
    for (const ext of extensions) {
      paths.push(`/images/cards/${normalized}${ext}`);
    }
  }
  
  // 3. Nome sanitizado sem prefixo "card_"
  if (sanitized) {
    for (const ext of extensions) {
      paths.push(`/images/cards/${sanitized}${ext}`);
    }
  }
  
  // 4. Variações do nome normalizado
  if (normalized) {
    const variations = generateCardNameVariations(normalized);
    for (const variation of variations) {
      if (variation !== normalized) {
        for (const ext of extensions) {
          paths.push(`/images/cards/${variation}${ext}`);
        }
      }
    }
  }
  
  return paths;
};

/**
 * Função para obter a imagem da carta, com fallback
 * Retorna o caminho da imagem local se disponível, ou null para usar fallback
 * AGORA: Todas as imagens são salvas com idCarta como nome do arquivo
 */
/** Path ou URL de imagem de carta válido (backend uploads/cards, legado /images/cards, ou Supabase) */
function isCardImagePath(p: string): boolean {
  return (
    p.startsWith('/images/cards/') ||
    p.startsWith('/uploads/cards/') ||
    (p.startsWith('https://') && p.includes('supabase.co/storage'))
  );
}

export const getCardImage = (card: any): string | null => {
  const cardImage = card?.cardImage;
  if (cardImage && typeof cardImage === 'string' && cardImage.trim() !== '' && isCardImagePath(cardImage)) {
    return cardImage;
  }

  const cardId = card?.idCarta || card?.id || card?.cardId;
  if (cardId) {
    const extensions = ['.jpg', '.jpeg', '.png', '.webp'];
    for (const ext of extensions) {
      return `/uploads/cards/${cardId}${ext}`;
    }
  }

  return null;
};

/**
 * Retorna todos os caminhos possíveis para uma carta (para o componente CardImage tentar)
 * AGORA: Todas as imagens são salvas com idCarta como nome do arquivo
 */
export const getAllCardImagePaths = (card: any): string[] => {
  const paths: string[] = [];
  const cardImage = card?.cardImage;
  const cardId = card?.idCarta || card?.id || card?.cardId;

  if (cardImage && typeof cardImage === 'string' && cardImage.trim() !== '' && isCardImagePath(cardImage)) {
    paths.push(cardImage);
  }

  if (cardId) {
    // Priorizar /images/cards (frontend public) — no duelo as imagens costumam estar aí
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
      paths.push(`/images/cards/${cardId}${ext}`);
    }
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
      paths.push(`/uploads/cards/${cardId}${ext}`);
    }
  }

  return Array.from(new Set(paths));
};

