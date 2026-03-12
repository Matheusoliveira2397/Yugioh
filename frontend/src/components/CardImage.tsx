import { useState, useEffect, useMemo, useRef } from 'react';
import { getCardImage, getAllCardImagePaths } from '../utils/cardImage';
import { getImageUrl } from '../utils/imageUrl';

interface CardImageProps {
  card: any;
  className?: string;
  style?: React.CSSProperties;
  fallback?: string;
  onError?: () => void;
  /** Timestamp para forçar recarregar a imagem (evita cache após atualizar no admin) */
  cacheBuster?: number;
}

/**
 * Componente que exibe a imagem de uma carta, tentando diferentes extensões automaticamente
 */
export default function CardImage({ card, className = '', style = {}, fallback = '/images/fundoCarta.webp', onError, cacheBuster }: CardImageProps) {
  // Memoizar o cardId para evitar recálculos desnecessários
  const cardId = useMemo(() => {
    return card?.idCarta || card?.id || card?.cardId;
  }, [card?.idCarta, card?.id, card?.cardId]);

  // Memoizar cardImageUrl para evitar recálculos - PRIORIDADE MÁXIMA
  const cardImageUrl = useMemo(() => {
    return getCardImage(card);
  }, [card?.idCarta, card?.id, card?.cardId, card?.cardImage, card?.name]);
  
  // Memoizar TODOS os caminhos possíveis (incluindo baseados no nome da carta)
  // Isso é importante porque o cardImage pode conter YGOPRO_ mas o arquivo real tem nome diferente
  const possiblePaths = useMemo(() => {
    return getAllCardImagePaths(card);
  }, [card?.idCarta, card?.id, card?.cardId, card?.cardImage, card?.name]);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [attemptedPaths, setAttemptedPaths] = useState<Set<string>>(new Set());
  
  // Usar refs para acessar valores atualizados dentro de callbacks
  const currentIndexRef = useRef(0);
  const imageSrcRef = useRef<string | null>(null);

  // Usar useRef para rastrear o último cardId processado
  const lastCardIdRef = useRef<string | number | null>(null);
  const lastImageSrcRef = useRef<string | null>(null);
  
  useEffect(() => {
    // Só processar se o cardId mudou
    if (cardId === lastCardIdRef.current && lastImageSrcRef.current !== null) {
      return; // Já processamos esta carta
    }
    
    // Se o cardId mudou, resetar tudo
    if (cardId !== lastCardIdRef.current) {
      lastCardIdRef.current = cardId;
      setHasError(false);
      setCurrentIndex(0);
      setAttemptedPaths(new Set());
      currentIndexRef.current = 0;
      imageSrcRef.current = null;
      lastImageSrcRef.current = null;
    }
    
    // PRIORIDADE 1: Usar o primeiro caminho possível (já ordenado por prioridade)
    // O getAllCardImagePaths retorna caminhos na ordem: nome da carta -> idCarta (YGOPRO_ ignorado)
    if (possiblePaths.length > 0) {
      const firstPath = possiblePaths[0];
      console.log(`[CardImage] 🎯 Tentando primeiro caminho para "${card?.name}":`, firstPath, `(total: ${possiblePaths.length} caminhos)`);
      setImageSrc(firstPath);
      imageSrcRef.current = firstPath;
      lastImageSrcRef.current = firstPath;
      setAttemptedPaths(new Set([firstPath]));
      setCurrentIndex(0);
      currentIndexRef.current = 0;
      return;
    }
    
    // Debug: Logar apenas se não conseguir encontrar imagem
    if (!cardImageUrl && !cardId) {
      console.warn(`[CardImage] ⚠️ Não foi possível encontrar imagem para "${card?.name}":`, {
        idCarta: card?.idCarta,
        id: card?.id,
        cardId: card?.cardId,
        cardImage: card?.cardImage,
        cardImageUrl: cardImageUrl,
      });
    }
    
    // Se não tiver nem cardImageUrl nem cardId, mostrar erro
    if (!cardId && !cardImageUrl) {
      console.warn(`[CardImage] ⚠️ Carta sem idCarta e sem cardImage:`, card?.name, {
        id: card?.id,
        idCarta: card?.idCarta,
        cardId: card?.cardId,
        cardImage: card?.cardImage,
        card: card
      });
    }
    
    setImageSrc(null);
    imageSrcRef.current = null;
    lastImageSrcRef.current = null;
    setHasError(true);
  }, [cardId, cardImageUrl, possiblePaths.length, card?.name, card?.cardImage]); // Só executar quando cardId, cardImageUrl ou número de paths mudarem

  const handleImageError = () => {
    const currentSrc = imageSrcRef.current;
    const currentIdx = currentIndexRef.current;
    
    setAttemptedPaths(prev => {
      const newAttempted = new Set(prev);
      if (currentSrc) {
        newAttempted.add(currentSrc);
        console.log(`[CardImage] ❌ Falhou ao carregar "${card?.name}":`, currentSrc);
      }
      
      // Tentar próximo caminho se houver
      const nextIndex = currentIdx + 1;
      if (nextIndex < possiblePaths.length) {
        const nextPath = possiblePaths[nextIndex];
        // Verificar se já tentamos este caminho
        if (!newAttempted.has(nextPath)) {
          console.log(`[CardImage] 🔄 Tentando próximo caminho (${nextIndex + 1}/${possiblePaths.length}) para "${card?.name}":`, nextPath);
          // Atualizar refs e estado
          currentIndexRef.current = nextIndex;
          imageSrcRef.current = nextPath;
          setCurrentIndex(nextIndex);
          setImageSrc(nextPath);
          newAttempted.add(nextPath);
        } else {
          // Já tentamos todos os caminhos
          console.warn(`[CardImage] ⚠️ Todos os caminhos falharam para "${card?.name}" (${newAttempted.size} tentativas)`);
          setHasError(true);
          if (onError) onError();
        }
      } else {
        // Todas as extensões falharam
        console.warn(`[CardImage] ⚠️ Todos os caminhos falharam para "${card?.name}" (${possiblePaths.length} caminhos tentados)`);
        setHasError(true);
        if (onError) onError();
      }
      
      return newAttempted;
    });
  };

  // Se não tem imagem ou deu erro, usar fallback
  if (!imageSrc || hasError) {
    // Se o fallback for um gradiente CSS, usar diretamente
    if (fallback.startsWith('linear-gradient')) {
      return (
        <div
          className={className}
          style={{
            background: fallback,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            ...style,
          }}
        >
          {card?.name && (
            <div className="w-full h-full flex items-center justify-center bg-black/30">
              <p className="text-xs text-white font-bold text-center px-1 line-clamp-3">
                {card.name}
              </p>
            </div>
          )}
        </div>
      );
    }
    
    // Caso contrário, usar como URL de imagem
    return (
      <div
        className={className}
        style={{
          backgroundImage: `url(${fallback})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          ...style,
        }}
      >
        {card?.name && (
          <div className="w-full h-full flex items-center justify-center bg-black/30">
            <p className="text-xs text-white font-bold text-center px-1 line-clamp-3">
              {card.name}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Paths relativos: servidos pelo backend (usar base da API). URL absoluta (ex.: Supabase) usar direto
  const isRelativePath = imageSrc && (imageSrc.startsWith('/images/cards') || imageSrc.startsWith('/uploads/cards'));
  let displaySrc = isRelativePath ? getImageUrl(imageSrc) : imageSrc;
  if (displaySrc && cacheBuster != null) {
    displaySrc += (displaySrc.includes('?') ? '&' : '?') + `t=${cacheBuster}`;
  }

  // Usar div com backgroundImage e img invisível para detectar erro
  return (
    <div
      className={className}
      style={{
        backgroundImage: `url(${displaySrc})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
        ...style,
      }}
    >
      {/* Imagem invisível para detectar erro de carregamento */}
      {/* IMPORTANTE: width e height mínimos são necessários para o onError funcionar */}
      <img
        src={displaySrc}
        alt=""
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          opacity: 0,
          pointerEvents: 'none',
          visibility: 'hidden',
        }}
        onError={async (e) => {
          // Verificar se a resposta é HTML (index.html do SPA)
          try {
            const response = await fetch(displaySrc || '', { method: 'HEAD' });
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('text/html')) {
              // Servidor retornou HTML em vez de imagem - tentar fallback
              console.warn(`[CardImage] ⚠️ Servidor retornou HTML para "${card?.name}":`, displaySrc);
              handleImageError();
              return;
            }
          } catch (fetchError) {
            // Se fetch falhar, continuar com handleImageError normal
          }
          // Tentar próximo caminho se houver
          handleImageError();
        }}
        onLoad={() => {
          // Imagem carregou com sucesso
          setHasError(false);
        }}
      />
    </div>
  );
}

