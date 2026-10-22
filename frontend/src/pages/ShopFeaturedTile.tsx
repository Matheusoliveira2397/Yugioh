import { useState } from 'react';
import GameIcon from '../components/GameIcon';

type FeaturedCategory = 'items' | 'playmats' | 'sleeves' | 'talismans';

interface ShopFeaturedTileProps {
  name: string;
  image?: string | null;
  category: FeaturedCategory;
  credits?: number | null;
  cash?: number | null;
  onExplore: () => void;
}

const FEATURE_ICON_ROUTE: Record<FeaturedCategory, string> = {
  items: '/inventory',
  playmats: '/arena',
  sleeves: '/deck-builder',
  talismans: '/missions',
};

/** Imagens do próprio catálogo; caso falhem, usa o ícone ilustrado correspondente. */
export default function ShopFeaturedTile({
  name, image, category, credits, cash, onExplore,
}: ShopFeaturedTileProps) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const route = FEATURE_ICON_ROUTE[category];
  const src = image?.trim()
    ? (/^https?:\/\//i.test(image) ? image : `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${image.startsWith('/') ? image : `/${image}`}`)
    : null;
  const hasImage = !!src && failedImage !== src;
  const hasCredits = credits != null && Number(credits) > 0;
  const hasCash = cash != null && Number(cash) > 0;

  return (
    <button
      type="button"
      onClick={onExplore}
      className="market-featured-tile group"
      aria-label={`Ver ${name} no catálogo`}
    >
      <span className={`market-featured-image market-featured-image--${category}`}>
        {hasImage ? (
          <img
            src={src!}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailedImage(src)}
          />
        ) : (
          <span className="market-featured-image-fallback" aria-hidden="true">
            <GameIcon route={route} size={42} />
          </span>
        )}
      </span>
      <span className="market-featured-info">
        <span className="market-featured-name" title={name}>{name}</span>
        {(hasCredits || hasCash) ? (
          <span className="market-featured-prices">
            {hasCredits && <span>{Number(credits).toLocaleString('pt-BR')} créditos</span>}
            {hasCash && <span>{Math.floor(Number(cash)).toLocaleString('pt-BR')} cash</span>}
          </span>
        ) : (
          <span className="market-featured-visit">Explorar categoria <span aria-hidden="true">→</span></span>
        )}
      </span>
    </button>
  );
}
