import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCosmeticsStore } from '../stores/cosmeticsStore';
import {
  getCardImageDisplayUrl,
  getCosmeticImageUrl,
  getDefaultSkinCardImageUrl,
} from '../utils/imageUrl';
import { getAllCardImagePaths } from '../utils/cardImage';

export type PackOpenReward =
  | {
      type: 'card';
      cardId: string;
      idCarta?: string;
      name: string;
      rarity: string;
      quantity: number;
      cardImage?: string | null;
    }
  | { type: 'credits'; amount: number };

type Props = {
  packName: string;
  rewards: PackOpenReward[];
  onClose: () => void;
};

const RARITY_GLOW: Record<string, string> = {
  Common: 'shadow-[0_0_18px_rgba(148,163,184,0.45)]',
  Rare: 'shadow-[0_0_22px_rgba(59,130,246,0.65)]',
  'Super Rare': 'shadow-[0_0_24px_rgba(34,211,238,0.7)]',
  'Ultra Rare': 'shadow-[0_0_28px_rgba(250,204,21,0.75)]',
  'Secret Rare': 'shadow-[0_0_30px_rgba(244,114,182,0.8)]',
  Legendary: 'shadow-[0_0_34px_rgba(251,146,60,0.9)]',
};

function isCard(r: PackOpenReward): r is Extract<PackOpenReward, { type: 'card' }> {
  return (r as { type?: string }).type === 'card' || !!(r as { cardId?: string }).cardId;
}

/** Normaliza cardImage do banco (às vezes vem sem `/` ou só com o nome do arquivo). */
function normalizePackCardImage(img?: string | null): string | null {
  if (!img || typeof img !== 'string' || !img.trim()) return null;
  const s = img.trim();
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) return s;
  if (s.startsWith('images/') || s.startsWith('uploads/')) return `/${s}`;
  if (/\.(webp|jpe?g|png|gif)$/i.test(s)) return `/images/cards/${s}`;
  return s;
}

type PackItem =
  | { key: string; kind: 'card'; reward: Extract<PackOpenReward, { type: 'card' }> }
  | { key: string; kind: 'credits'; reward: Extract<PackOpenReward, { type: 'credits' }> };

/** Arte da carta com fallbacks — img simples, sem 3D/CardImage. */
function PackCardArt({
  reward,
}: {
  reward: Extract<PackOpenReward, { type: 'card' }>;
}) {
  const paths = useMemo(() => {
    const card = {
      idCarta: reward.idCarta,
      cardId: reward.idCarta,
      id: reward.cardId,
      name: reward.name,
      cardImage: normalizePackCardImage(reward.cardImage),
    };
    return getAllCardImagePaths(card)
      .map((p) => getCardImageDisplayUrl(p))
      .filter(Boolean);
  }, [reward]);

  const [idx, setIdx] = useState(0);
  const src = paths[idx] || '';

  if (!src) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-white text-xs p-2 text-center">
        {reward.name}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={reward.name}
      className="absolute inset-0 w-full h-full object-cover"
      draggable={false}
      loading="eager"
      decoding="async"
      onError={() => {
        setIdx((i) => (i + 1 < paths.length ? i + 1 : i));
      }}
    />
  );
}

function PackFlipCard({
  item,
  index,
  dealt,
  revealed,
  cardBack,
  onReveal,
}: {
  item: PackItem;
  index: number;
  dealt: boolean;
  revealed: boolean;
  cardBack: string;
  onReveal: () => void;
}) {
  const glow =
    item.kind === 'card'
      ? RARITY_GLOW[item.reward.rarity] || RARITY_GLOW.Common
      : 'shadow-[0_0_26px_rgba(250,204,21,0.7)]';

  return (
    <motion.button
      type="button"
      className={`relative w-[92px] h-[134px] md:w-[110px] md:h-[160px] rounded-lg overflow-hidden border border-white/20 bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
        revealed ? glow : 'shadow-xl'
      }`}
      initial={{ opacity: 0, y: 80, scale: 0.25 }}
      animate={dealt ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 40, scale: 0.2 }}
      transition={{
        delay: dealt ? 0.05 + index * 0.1 : 0,
        duration: 0.5,
        type: 'spring',
        stiffness: 200,
        damping: 16,
      }}
      onClick={() => {
        if (!revealed) onReveal();
      }}
      aria-label={
        revealed
          ? item.kind === 'credits'
            ? `${item.reward.amount} créditos`
            : item.reward.name
          : 'Carta virada — clique para revelar'
      }
    >
      {/* Frente SEMPRE montada (pré-carrega a arte por baixo do verso) */}
      <div className="absolute inset-0">
        {item.kind === 'credits' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-amber-700 via-yellow-600 to-amber-900 p-2">
            <img
              src="/images/Icones/Credito.png"
              alt=""
              className="w-10 h-10 mb-2 drop-shadow"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <span className="text-white font-bold text-lg leading-none">{item.reward.amount}</span>
            <span className="text-amber-100 text-[10px] uppercase mt-1">créditos</span>
          </div>
        ) : (
          <>
            <PackCardArt reward={item.reward} />
            <div className="absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-black/90 via-black/55 to-transparent px-1.5 pt-6 pb-1.5 pointer-events-none">
              <p className="text-[10px] text-white font-semibold leading-tight line-clamp-2">
                {item.reward.name}
              </p>
              <p className="text-[9px] text-slate-300">{item.reward.rarity}</p>
            </div>
          </>
        )}
      </div>

      {/* Verso por cima — some ao revelar */}
      <motion.div
        className="absolute inset-0 z-[2]"
        initial={false}
        animate={{
          opacity: revealed ? 0 : 1,
          scaleX: revealed ? 0 : 1,
        }}
        transition={{ duration: 0.28, ease: 'easeInOut' }}
        style={{
          transformOrigin: 'center',
          pointerEvents: revealed ? 'none' : 'auto',
          backgroundImage: `url(${cardBack})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        <span className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-white/80 uppercase tracking-wide">
          Clique
        </span>
      </motion.div>
    </motion.button>
  );
}

export default function PackOpeningOverlay({ packName, rewards, onClose }: Props) {
  const { ownedSkins, equippedSkinId } = useCosmeticsStore();
  const [dealt, setDealt] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [packBurst, setPackBurst] = useState(false);

  const cardBack = useMemo(() => {
    const skin = equippedSkinId ? ownedSkins.find((s) => s.id === equippedSkinId) : null;
    if (skin?.image) return getCosmeticImageUrl(skin.image) || getDefaultSkinCardImageUrl();
    return getDefaultSkinCardImageUrl() || '/images/fundoCarta.webp';
  }, [equippedSkinId, ownedSkins]);

  const items = useMemo((): PackItem[] => {
    return rewards.flatMap<PackItem>((r, idx) => {
      if (isCard(r)) {
        const qty = Math.max(1, r.quantity || 1);
        const reward = {
          ...r,
          type: 'card' as const,
          quantity: 1,
          cardImage: normalizePackCardImage(r.cardImage),
        };
        return Array.from({ length: qty }, (_, q) => ({
          key: `card-${idx}-${q}`,
          kind: 'card' as const,
          reward,
        }));
      }
      return [
        {
          key: `credits-${idx}`,
          kind: 'credits' as const,
          reward: r as Extract<PackOpenReward, { type: 'credits' }>,
        },
      ];
    });
  }, [rewards]);

  const allRevealed = items.length > 0 && items.every((_, i) => revealed[i]);

  useEffect(() => {
    const t1 = window.setTimeout(() => setPackBurst(true), 350);
    const t2 = window.setTimeout(() => setDealt(true), 700);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const reveal = (index: number) => {
    setRevealed((prev) => (prev[index] ? prev : { ...prev, [index]: true }));
  };

  const revealAll = () => {
    const next: Record<number, boolean> = {};
    items.forEach((_, i) => {
      next[i] = true;
    });
    setRevealed(next);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-arena-void/90 backdrop-blur-md p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label="Abertura de pacote"
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(232,197,71,0.18),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(61,184,197,0.08),transparent_45%)]" />
        </div>

        <motion.h2
          className="relative z-10 game-page-title text-champion-gold mb-2 text-center"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          {packName}
        </motion.h2>
        <p className="relative z-10 text-arena-mist text-sm mb-6 text-center">
          {allRevealed
            ? 'Todas as cartas reveladas!'
            : dealt
              ? 'Clique em cada carta para revelar'
              : 'Abrindo pacote...'}
        </p>

        <div className="relative z-10 mb-8 h-36 w-28 flex items-center justify-center">
          <motion.img
            src="/images/box.png"
            alt="Pacote"
            className="w-24 h-auto drop-shadow-2xl"
            initial={{ scale: 0.6, rotate: -8, opacity: 0 }}
            animate={
              packBurst
                ? { scale: [1, 1.15, 0.2], opacity: [1, 1, 0], rotate: [0, 6, 0] }
                : { scale: 1, rotate: 0, opacity: 1 }
            }
            transition={{ duration: packBurst ? 0.55 : 0.4, ease: 'easeOut' }}
          />
          {packBurst && (
            <motion.div
              className="absolute inset-0 rounded-full bg-indigo-400/40 blur-2xl"
              initial={{ scale: 0.4, opacity: 0.8 }}
              animate={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: 0.7 }}
            />
          )}
        </div>

        <div className="relative z-10 flex flex-wrap justify-center gap-3 md:gap-4 max-w-5xl">
          {items.map((item, index) => (
            <PackFlipCard
              key={item.key}
              item={item}
              index={index}
              dealt={dealt}
              revealed={!!revealed[index]}
              cardBack={cardBack}
              onReveal={() => reveal(index)}
            />
          ))}
        </div>

        <div className="relative z-10 mt-8 flex flex-wrap gap-3 justify-center">
          {!allRevealed && (
            <button type="button" onClick={revealAll} className="btn-champion px-5 py-2.5">
              Revelar todas
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-secondary px-5 py-2.5 text-sm">
            {allRevealed ? 'Fechar' : 'Pular'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
