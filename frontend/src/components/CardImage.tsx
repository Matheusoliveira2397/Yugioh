import { useState, useEffect, useMemo, useRef } from 'react';
import { getCardImage, getCardImagePaths } from '../utils/cardImage';

interface CardImageProps {
  card: any;
  className?: string;
  style?: React.CSSProperties;
  fallback?: string;
  onError?: () => void;
}

/**
 * Componente que exibe a imagem de uma carta, tentando diferentes extensões automaticamente
 */
export default function CardImage({ card, className = '', style = {}, fallback = '/images/fundoCarta.webp', onError }: CardImageProps) {
  // Memoizar o cardId para evitar recálculos desnecessários
  const cardId = useMemo(() => {
    return card?.idCarta || card?.id || card?.cardId;
  }, [card?.idCarta, card?.id, card?.cardId]);

  // Memoizar os caminhos possíveis - só recalcular se cardId mudar
  const possiblePaths = useMemo(() => {
    if (!cardId) return [];
    return getCardImagePaths(cardId);
  }, [cardId]);
  
  // Memoizar cardImageUrl para evitar recálculos
  const cardImageUrl = useMemo(() => {
    return getCardImage(card);
  }, [card?.idCarta, card?.id, card?.cardId, card?.cardImage]);

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
    
    // Debug: apenas logar se não tiver idCarta (para identificar problemas)
    if (!cardId) {
      console.warn(`[CardImage] ⚠️ Carta sem idCarta:`, card?.name, card);
      return;
    }
    
    // Usar cardImageUrl memoizado
    if (cardImageUrl) {
      setImageSrc(cardImageUrl);
      imageSrcRef.current = cardImageUrl;
      lastImageSrcRef.current = cardImageUrl;
      setAttemptedPaths(new Set([cardImageUrl]));
    } else if (possiblePaths.length > 0) {
      // Usar o primeiro caminho possível
      setImageSrc(possiblePaths[0]);
      imageSrcRef.current = possiblePaths[0];
      lastImageSrcRef.current = possiblePaths[0];
      setAttemptedPaths(new Set([possiblePaths[0]]));
      setCurrentIndex(0);
      currentIndexRef.current = 0;
    } else {
      console.error(`[CardImage] ❌ Sem caminhos possíveis! cardId: ${cardId}, card:`, card?.name);
      setImageSrc(null);
      imageSrcRef.current = null;
      lastImageSrcRef.current = null;
      setHasError(true);
    }
  }, [cardId, cardImageUrl, possiblePaths.length]); // Só executar quando cardId, cardImageUrl ou número de paths mudarem

  const handleImageError = () => {
    const currentSrc = imageSrcRef.current;
    const currentIdx = currentIndexRef.current;
    
    setAttemptedPaths(prev => {
      const newAttempted = new Set(prev);
      if (currentSrc) {
        newAttempted.add(currentSrc);
      }
      
      // Tentar próximo caminho disponível
      const nextIndex = currentIdx + 1;
      if (nextIndex < possiblePaths.length) {
        const nextPath = possiblePaths[nextIndex];
        // Verificar se já tentamos este caminho
        if (!newAttempted.has(nextPath)) {
          // Atualizar refs e estado
          currentIndexRef.current = nextIndex;
          imageSrcRef.current = nextPath;
          setCurrentIndex(nextIndex);
          setImageSrc(nextPath);
          newAttempted.add(nextPath);
        } else {
          // Já tentamos todos os caminhos
          setHasError(true);
          if (onError) onError();
        }
      } else {
        // Todas as extensões falharam
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

  // Usar div com backgroundImage e img invisível para detectar erro
  return (
    <div
      className={className}
      style={{
        backgroundImage: `url(${imageSrc})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
        ...style,
      }}
    >
      {/* Imagem invisível para detectar erro de carregamento */}
      {/* IMPORTANTE: width e height mínimos são necessários para o onError funcionar */}
      <img
        src={imageSrc}
        alt=""
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          opacity: 0,
          pointerEvents: 'none',
          visibility: 'hidden',
        }}
                onError={(e) => {
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

