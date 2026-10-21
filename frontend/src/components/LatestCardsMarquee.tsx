import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext';
import { motion } from 'framer-motion';
import CardImage from './CardImage';
import DeckCopyLimitBadge from './DeckCopyLimitBadge';
import { CARD_IMAGE_GRID_PROPS } from '../utils/cardImage';

export interface MarqueeCard {
  id: string;
  idCarta?: string;
  name: string;
  cardImage?: string;
  type: string;
  rarity?: string;
  createdAt?: string;
  /** Percentual de desconto da promoção (ex.: 20). Usado para exibir badge igual à aba Cartas. */
  promotionDiscountPercent?: number;
  /** Limite no deck (loja repassa para o badge no carrossel). */
  maxCopiesInDeck?: number;
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
  /** Exibir ícone de promoção no canto superior direito de cada carta */
  showPromotionBadge?: boolean;
  /** Versão compacta (home): cartas menores e menos padding */
  compact?: boolean;
}

function CardMarqueeItem({
  card,
  onClick,
  showPromotionBadge = false,
  priorityLoad,
  compact = false,
}: {
  card: MarqueeCard;
  onClick: (card: MarqueeCard) => void;
  showPromotionBadge?: boolean;
  /** Primeiras posições do carrossel: carregar antes (menos espera visual). */
  priorityLoad?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(card)}
      onKeyDown={(e) => e.key === 'Enter' && onClick(card)}
      className="flex-shrink-0 cursor-pointer group focus:outline-none focus:ring-2 focus:ring-champion-gold/40 rounded-lg"
    >
      <div
        className={`relative rounded-md overflow-hidden border border-champion-gold/30 shadow group-hover:border-champion-gold/70 group-hover:shadow-champion-gold/15 group-hover:scale-105 group-hover:z-10 transition-all duration-300 ${
          compact
            ? 'w-14 h-[5.25rem] sm:w-16 sm:h-24'
            : 'w-16 h-24 sm:w-20 sm:h-28 md:w-24 md:h-32'
        }`}
      >
        {showPromotionBadge && (card.promotionDiscountPercent != null && card.promotionDiscountPercent > 0) && (
          <div
            className={`absolute top-0.5 right-0.5 z-20 flex items-center justify-center rounded-md bg-rose-500/95 text-white font-bold shadow-lg border border-rose-300/50 ${
              compact ? 'min-w-[20px] h-5 px-1 text-[9px]' : 'min-w-[28px] h-7 px-1.5 text-xs'
            }`}
            title={`${card.promotionDiscountPercent}% off`}
          >
            -{card.promotionDiscountPercent}%
          </div>
        )}
        <CardImage
          card={card}
          className="w-full h-full"
          fallback="/images/fundoCarta.webp"
          {...CARD_IMAGE_GRID_PROPS}
          loading={priorityLoad ? 'eager' : 'lazy'}
          fetchPriority={priorityLoad ? 'high' : 'low'}
        />
        {card.maxCopiesInDeck !== undefined && (
          <DeckCopyLimitBadge
            maxCopiesInDeck={card.maxCopiesInDeck}
            variant="floating"
            showStandardLimit
            className="!left-0.5 !right-auto top-0.5 z-20 h-[16px] w-[16px] border text-[8px]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        {!compact && (
          <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/90 to-transparent">
            <p className="text-[7px] font-semibold text-white truncate">{card.name}</p>
            <p className="text-[6px] text-blue-300/90 truncate">{card.type}</p>
          </div>
        )}
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
  showPromotionBadge = false,
  compact = false,
}: LatestCardsMarqueeProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const handleCardClick = (card: MarqueeCard) => {
    if (onCardClick) onCardClick(card);
    else navigate('/shop');
  };

  const shellClass = compact
    ? `game-panel overflow-hidden w-full max-w-full p-2.5 sm:p-3 ${className}`
    : `rounded-xl p-2 sm:p-3 md:p-3.5 border border-blue-600/25 bg-slate-950/40 overflow-hidden w-full max-w-full shadow-lg shadow-black/15 ring-1 ring-white/[0.04] ${className}`;

  if (cards.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className={`${shellClass} text-center`}
      >
        <h2 className={`font-bold flex items-center justify-center gap-1.5 text-white/80 mb-1 ${compact ? 'text-xs sm:text-sm' : 'text-xs'}`}>
          <span>🎴</span>
          <span>{t('marquee.latestCardsAdded')}</span>
        </h2>
        <p className="text-white/60 text-sm">{t('marquee.noCardsAvailable')}</p>
        {showVerLoja && (
          <button
            type="button"
            onClick={() => navigate('/shop')}
            className="mt-2 text-sm text-champion-cyan hover:text-champion-gold font-medium"
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
      className={shellClass}
    >
      {!hideTitle && (
      <div className={`flex items-center justify-between gap-2 ${compact ? 'mb-2' : 'mb-1.5'}`}>
        <h2 className={`font-bold flex items-center gap-1.5 text-white drop-shadow-lg ${compact ? 'text-xs sm:text-sm' : 'text-xs md:text-sm'}`}>
          <span className={compact ? 'text-sm' : 'text-sm'}>🎴</span>
          <span>{t('marquee.latestCardsAdded')}</span>
          {!compact && (
            <span className="text-[9px] font-normal text-white/50 hidden sm:inline">— passe o mouse para pausar</span>
          )}
        </h2>
        {showVerLoja && (
          <button
            type="button"
            onClick={() => navigate('/shop')}
            className={`font-semibold text-champion-cyan hover:text-champion-gold transition-colors whitespace-nowrap shrink-0 ${
              compact ? 'text-xs sm:text-sm' : 'text-xs md:text-sm'
            }`}
          >
            {t('marquee.viewShop')} →
          </button>
        )}
      </div>
      )}
      <div className="shop-cards-wrap relative">
        <div className="overflow-hidden">
          <div className={`shop-marquee-track flex w-max py-0.5 ${compact ? 'gap-2' : 'gap-2 md:gap-2.5'}`}>
            {/* 2ª faixa só para loop CSS — imagens lazy (browser usa cache da 1ª cópia) */}
            {[...cards, ...cards].map((card, index) => (
              <CardMarqueeItem
                key={`top-${card.id}-${index}`}
                card={card}
                onClick={handleCardClick}
                showPromotionBadge={showPromotionBadge}
                priorityLoad={index < Math.min(4, cards.length)}
                compact={compact}
              />
            ))}
          </div>
        </div>
        <div className={`pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-black/80 to-transparent z-10 ${compact ? 'w-5 md:w-8' : 'w-8 md:w-12'}`} />
        <div className={`pointer-events-none absolute inset-y-0 right-0 bg-gradient-to-l from-black/80 to-transparent z-10 ${compact ? 'w-5 md:w-8' : 'w-8 md:w-12'}`} />
      </div>
    </motion.div>
  );
}
