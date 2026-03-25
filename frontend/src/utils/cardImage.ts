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

/** Cache de sessão: primeiro path que carregou com sucesso por idCarta (evita 404 em duplicatas no duelo/loja). */
const cardImageLoadSuccess = new Map<string, string>();

export function rememberSuccessfulCardImagePath(cardKey: string, path: string): void {
  const k = (cardKey || '').trim();
  const p = (path || '').trim();
  if (!k || !p) return;
  if (!cardImageLoadSuccess.has(k)) cardImageLoadSuccess.set(k, p);
}

export function peekSuccessfulCardImagePath(cardKey: string): string | null {
  return cardImageLoadSuccess.get((cardKey || '').trim()) ?? null;
}

/** Extensão sugerida a partir de um path/URL já conhecido (1 tentativa a menos). */
function extFromCardImageField(cardImage: string | undefined | null): string | null {
  if (!cardImage || typeof cardImage !== 'string') return null;
  const base = cardImage.split('?')[0].split('/').pop() || '';
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')).toLowerCase() : '';
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext;
  return null;
}

/**
 * Função para obter a imagem da carta, com fallback
 * Retorna o caminho da imagem local se disponível, ou null para usar fallback
 * AGORA: Todas as imagens são salvas com idCarta como nome do arquivo
 */
/** Path ou URL de imagem de carta válido (backend uploads/cards, legado /images/cards, ou URL absoluta ex.: Supabase) */
function isCardImagePath(p: string): boolean {
  if (!p || typeof p !== 'string' || p.trim() === '') return false;
  const s = p.trim();
  return (
    s.startsWith('/images/cards/') ||
    s.startsWith('/uploads/cards/') ||
    s.startsWith('https://') ||
    s.startsWith('http://')
  );
}

/**
 * Preferência: arquivos estáticos em `frontend/public/images/cards` (nome = idCarta),
 * alinhado ao script de download — não usar `cardImage` do banco para a primeira URL.
 */
export const getCardImage = (card: any): string | null => {
  const idCarta = card?.idCarta || card?.cardId;
  if (idCarta != null && String(idCarta).trim() !== '') {
    const id = String(idCarta).trim();
    const hit = peekSuccessfulCardImagePath(id);
    if (hit) return hit;
    const hinted = extFromCardImageField(card?.cardImage);
    const ext = hinted || '.jpg';
    return `/images/cards/${id}${ext}`;
  }

  const legacyId = card?.id;
  if (legacyId != null && String(legacyId).trim() !== '') {
    const lid = String(legacyId).trim();
    const hit = peekSuccessfulCardImagePath(lid);
    if (hit) return hit;
    const hinted = extFromCardImageField(card?.cardImage);
    return `/images/cards/${lid}${hinted || '.jpg'}`;
  }

  const cardImage = card?.cardImage;
  if (cardImage && typeof cardImage === 'string' && cardImage.trim() !== '' && isCardImagePath(cardImage)) {
    return cardImage.trim();
  }

  return null;
};

/**
 * Ordem: extensões mais comuns no projeto primeiro (menos 404 em sequência).
 */
const CARD_IMAGE_EXTS_ORDER = ['.jpg', '.webp', '.jpeg', '.png', '.gif'] as const;

function orderedExts(preferFirst?: string | null): string[] {
  const hint = preferFirst?.toLowerCase();
  const rest = CARD_IMAGE_EXTS_ORDER.filter((e) => e !== hint);
  return hint && CARD_IMAGE_EXTS_ORDER.includes(hint as (typeof CARD_IMAGE_EXTS_ORDER)[number])
    ? [hint, ...rest]
    : [...CARD_IMAGE_EXTS_ORDER];
}

/**
 * Quando há idCarta estável (ex.: YGOPRO_*), não gerar dezenas de URLs por nome — só atrasam o carregamento.
 */
function shouldIncludeNameBasedPaths(card: any): boolean {
  const idCarta = card?.idCarta || card?.cardId;
  if (idCarta == null || String(idCarta).trim() === '') return true;
  const id = String(idCarta).trim();
  if (/^YGOPRO[_-]/i.test(id)) return false;
  if (/^[a-zA-Z]+[_-][\w.-]+$/.test(id)) return false;
  return true;
}

export type GetAllCardImagePathsOptions = {
  /** Listas grandes (ex.: admin em grade): sem dezenas de URLs por nome — menos 404 e menos rede. */
  omitNameBasedPaths?: boolean;
  /** Só estas extensões (ex.: grade admin: jpg + webp). */
  extensions?: readonly string[];
};

/**
 * Retorna todos os caminhos possíveis para uma carta (para o componente CardImage tentar)
 * AGORA: Todas as imagens são salvas com idCarta como nome do arquivo
 */
export const getAllCardImagePaths = (card: any, options?: GetAllCardImagePathsOptions): string[] => {
  const paths: string[] = [];
  const cardImage = card?.cardImage?.trim();
  const idCarta = card?.idCarta || card?.cardId;
  const hinted = extFromCardImageField(cardImage);
  const exts =
    options?.extensions && options.extensions.length > 0
      ? orderedExts(hinted).filter((e) => options.extensions!.includes(e))
      : orderedExts(hinted);
  const useExts = exts.length > 0 ? exts : orderedExts(hinted);

  if (idCarta != null && String(idCarta).trim() !== '') {
    const id = String(idCarta).trim();
    const hit = peekSuccessfulCardImagePath(id);
    if (hit) paths.push(hit);
    for (const ext of useExts) {
      paths.push(`/images/cards/${id}${ext}`);
    }
  }

  if (card?.name && shouldIncludeNameBasedPaths(card) && !options?.omitNameBasedPaths) {
    paths.push(...getCardNameBasedPaths(card.name));
  }

  if (idCarta != null && String(idCarta).trim() !== '') {
    const id = String(idCarta).trim();
    for (const ext of useExts) {
      paths.push(`/uploads/cards/${id}${ext}`);
    }
  }

  const legacyId = card?.id;
  if ((!idCarta || String(idCarta).trim() === '') && legacyId != null && String(legacyId).trim() !== '') {
    const id = String(legacyId).trim();
    for (const ext of useExts) {
      paths.push(`/images/cards/${id}${ext}`);
    }
  }

  if (cardImage && isCardImagePath(cardImage)) {
    paths.push(cardImage);
  }

  return Array.from(new Set(paths));
};

