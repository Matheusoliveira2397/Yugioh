import { useEffect, useState } from 'react';
import CardImage from './CardImage';

type CardArt = {
  name?: string | null;
  rarity?: string | null;
  idCarta?: string | number | null;
  cardImage?: string | null;
  id?: string | number | null;
  cardId?: string | number | null;
};

interface CardArtViewerProps {
  card: CardArt;
  onClose: () => void;
}

/**
 * Inspect the original card artwork, not a stretched thumbnail or CSS-upscaled canvas.
 * Image quality is bounded by the actual uploaded asset resolution.
 */
export default function CardArtViewer({ card, onClose }: CardArtViewerProps) {
  const [large, setLarge] = useState(false);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[160] flex items-center justify-center bg-[#050912]/95 px-3 py-5 backdrop-blur-xl"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Imagem ampliada: ${card.name || 'Carta'}`}
        className="ui-inspector-panel custom-scrollbar max-h-[94dvh] w-full max-w-[640px] overflow-auto p-4 sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="ui-eyebrow">Galeria de cartas</p>
            <h2 className="mt-1 truncate text-xl font-bold text-white sm:text-2xl">{card.name || 'Carta'}</h2>
            {card.rarity && <span className="text-sm text-amber-200/85">{card.rarity}</span>}
          </div>
          <button type="button" aria-label="Fechar visualização ampliada" onClick={onClose} className="ui-icon-button shrink-0">✕</button>
        </div>
        <div className="flex justify-center">
          <div className={`ui-card-inspect-frame w-full transition-[max-width] duration-200 ${large ? 'max-w-[470px]' : 'max-w-[330px]'}`}>
            <CardImage
              card={card}
              className="h-full w-full"
              objectFit="contain"
              loading="eager"
              fetchPriority="high"
              sizes={large ? '(max-width: 640px) 88vw, 470px' : '(max-width: 640px) 88vw, 330px'}
            />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" className="ui-button-secondary" onClick={() => setLarge(false)} aria-pressed={!large}>Ajustar à tela</button>
          <button type="button" className="ui-button-primary" onClick={() => setLarge(true)} aria-pressed={large}>Ampliar imagem</button>
        </div>
        <p className="mt-3 text-center text-xs leading-relaxed text-slate-400">
          Exibição sem cortes, usando a imagem original disponível. Se o arquivo enviado tiver baixa resolução, ele precisará ser substituído por uma versão melhor.
        </p>
      </section>
    </div>
  );
}
