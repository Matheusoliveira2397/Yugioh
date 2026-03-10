import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext';
import { motion } from 'framer-motion';
import { getCardImage } from '../utils/cardImage';

export interface MarqueeCard {
  id: string;
  idCarta?: string;
  name: string;
  cardImage?: string;
  type: string;
  rarity?: string;
  createdAt?: string;
}

interface LatestCardsMarqueeProps {
  cards: MarqueeCard[];
  /** Mostrar botão "Ver loja" (na home sim, na login pode ser true também) */
  showVerLoja?: boolean;
  /** Classe CSS extra no container */
  className?: string;
  /** Se informado, ao clicar na carta chama isso em vez de navegar para /shop */
  onCardClick?: (card: MarqueeCard) => void;
  /** Ocultar título interno (ex.: quando o título já vem de fora, como na loja) */
  hideTitle?: boolean;
}

function CardMarqueeItem({
  card,
  onClick,
}: {
  card: MarqueeCard;
  onClick: (card: MarqueeCard) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(card)}
      onKeyDown={(e) => e.key === 'Enter' && onClick(card)}
      className="flex-shrink-0 cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-400/50 rounded-lg"
    >
      <div className="relative w-16 h-24 sm:w-20 sm:h-28 md:w-24 md:h-32 rounded-md overflow-hidden border border-blue-600/50 shadow group-hover:border-amber-500/60 group-hover:shadow-amber-500/20 group-hover:scale-105 group-hover:z-10 transition-all duration-300">
        <img
          src={getCardImage(card) || '/images/fundoCarta.webp'}
          alt={card.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.src = '/images/fundoCarta.webp';
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/90 to-transparent">
          <p className="text-[7px] font-semibold text-white truncate">{card.name}</p>
          <p className="text-[6px] text-blue-300/90 truncate">{card.type}</p>
        </div>
      </div>
    </div>
  );
}

export default function LatestCardsMarquee({
  cards,
  showVerLoja = true,
  className = '',
  onCardClick,
  hideTitle = false,
}: LatestCardsMarqueeProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const handleCardClick = (card: MarqueeCard) => {
    if (onCardClick) onCardClick(card);
    else navigate('/shop');
  };

  if (cards.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className={`rounded-lg p-2 md:p-3 border border-blue-700/30 bg-black/20 text-center max-w-2xl mx-auto ${className}`}
      >
        <h2 className="text-xs font-bold flex items-center justify-center gap-1.5 text-white/80 mb-1">
          <span>🎴</span>
          <span>{t('marquee.latestCardsAdded')}</span>
        </h2>
        <p className="text-white/60 text-xs">{t('marquee.noCardsAvailable')}</p>
        {showVerLoja && (
          <button
            type="button"
            onClick={() => navigate('/shop')}
            className="mt-2 text-sm text-blue-400 hover:text-blue-300 font-medium"
          >
            {t('marquee.goToShop')}
          </button>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className={`rounded-lg p-2 md:p-3 border border-blue-700/30 bg-black/30 overflow-hidden max-w-2xl mx-auto ${className}`}
    >
      {!hideTitle && (
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h2 className="text-xs md:text-sm font-bold flex items-center gap-1.5 text-white drop-shadow-lg">
          <span className="text-sm">🎴</span>
          <span>{t('marquee.latestCardsAdded')}</span>
          <span className="text-[9px] font-normal text-white/50 hidden sm:inline">— passe o mouse para pausar</span>
        </h2>
        {showVerLoja && (
          <button
            type="button"
            onClick={() => navigate('/shop')}
            className="text-xs md:text-sm font-semibold text-blue-300 hover:text-blue-200 transition-colors whitespace-nowrap shrink-0"
          >
            {t('marquee.viewShop')} →
          </button>
        )}
      </div>
      )}
      <div className="shop-cards-wrap relative">
        <div className="overflow-hidden">
          <div className="shop-marquee-track flex gap-2 md:gap-2.5 w-max py-0.5">
            {[...cards, ...cards].map((card, index) => (
              <CardMarqueeItem
                key={`top-${card.id}-${index}`}
                card={card}
                onClick={handleCardClick}
              />
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 md:w-12 bg-gradient-to-r from-black/80 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 md:w-12 bg-gradient-to-l from-black/80 to-transparent z-10" />
      </div>
    </motion.div>
  );
}
