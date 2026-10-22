import GameIcon from '../components/GameIcon';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';
import CardImage from '../components/CardImage';
import { CARD_IMAGE_GRID_PROPS } from '../utils/cardImage';
import { getCardDescription } from '../utils/cardDescription';
import { useI18n } from '../i18n/I18nContext';

type CollectionCard = {
  id: string;
  idCarta?: string;
  name: string;
  description: string | null;
  cardImage?: string | null;
  type: string;
  rarity: string;
  level?: number | null;
  atk?: number | null;
  def?: number | null;
  attribute?: string | null;
  race?: string | null;
  isForSale: boolean;
  owned: boolean;
  quantity: number;
};

type OwnershipFilter = 'all' | 'owned' | 'missing';
type SourceFilter = 'all' | 'shop' | 'outside';

const RARITIES = ['Common', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare', 'Legendary'] as const;

const RARITY_TEXT: Record<string, string> = {
  Common: 'text-arena-mist',
  Rare: 'text-blue-300',
  'Super Rare': 'text-champion-cyan',
  'Ultra Rare': 'text-champion-gold',
  'Secret Rare': 'text-pink-300',
  Legendary: 'text-orange-300',
};

export default function CollectionPage() {
  const { t } = useI18n();
  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [ownedActiveCards, setOwnedActiveCards] = useState(0);
  const [totalActiveCards, setTotalActiveCards] = useState(0);
  const [collectionPercent, setCollectionPercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [ownership, setOwnership] = useState<OwnershipFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [rarity, setRarity] = useState('');
  const [type, setType] = useState('');
  const [selected, setSelected] = useState<CollectionCard | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const { data } = await api.get('/cards/collection', { timeout: 30000 });
        setCards(Array.isArray(data?.cards) ? data.cards : []);
        setOwnedActiveCards(Number(data?.ownedActiveCards) || 0);
        setTotalActiveCards(Number(data?.totalActiveCards) || 0);
        setCollectionPercent(Number(data?.collectionPercent) || 0);
      } catch (e: any) {
        setError(e?.response?.data?.message || 'Não foi possível carregar a coleção');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const types = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => c.type && set.add(c.type));
    return [...set].sort();
  }, [cards]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (ownership === 'owned' && !c.owned) return false;
      if (ownership === 'missing' && c.owned) return false;
      if (source === 'shop' && !c.isForSale) return false;
      if (source === 'outside' && c.isForSale) return false;
      if (rarity && c.rarity !== rarity) return false;
      if (type && c.type !== type) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cards, ownership, source, rarity, type, search]);

  return (
    <div className="mx-auto max-w-7xl px-[clamp(0.75rem,2.5vw,1.75rem)] py-5 text-white">
      <header className="game-screen-hero mb-5">
        <p className="game-screen-kicker">Galeria de cartas</p>
        <h1 className="game-screen-heading"><span className="game-screen-icon"><GameIcon route="/collection" size={27} /></span>{t('collection.title')}</h1>
        <p className="game-screen-subtitle">{t('collection.subtitle')}</p>
      </header>

      <div className="game-panel p-4 mb-5">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-arena-mist font-semibold mb-0.5">
              {t('collection.progress')}
            </p>
            <p className="font-display text-2xl font-bold text-champion-gold">
              {collectionPercent.toFixed(1)}%
              <span className="text-sm text-arena-mist font-sans font-medium ml-2">
                ({ownedActiveCards}/{totalActiveCards})
              </span>
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <Link to="/loot-boxes" className="text-champion-cyan hover:text-champion-gold transition-colors font-semibold">
              Pacotes →
            </Link>
            <Link to="/shop" className="text-champion-gold hover:text-champion-cyan transition-colors font-semibold">
              {t('collection.goShop')} →
            </Link>
          </div>
        </div>
        <div className="game-progress-track">
          <div
            className="game-progress-fill"
            style={{ width: `${Math.min(100, Math.max(0, collectionPercent))}%` }}
          />
        </div>
      </div>

      <div className="game-panel p-3 mb-5 grid gap-2 md:grid-cols-2 lg:grid-cols-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('collection.search')}
          className="game-input lg:col-span-2"
        />
        <select
          value={ownership}
          onChange={(e) => setOwnership(e.target.value as OwnershipFilter)}
          className="game-select"
        >
          <option value="all">{t('collection.filterAll')}</option>
          <option value="owned">{t('collection.filterOwned')}</option>
          <option value="missing">{t('collection.filterMissing')}</option>
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as SourceFilter)}
          className="game-select"
        >
          <option value="all">{t('collection.sourceAll')}</option>
          <option value="shop">{t('collection.sourceShop')}</option>
          <option value="outside">{t('collection.sourceOutside')}</option>
        </select>
        <select value={rarity} onChange={(e) => setRarity(e.target.value)} className="game-select">
          <option value="">{t('collection.allRarities')}</option>
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="game-select lg:col-span-2"
        >
          <option value="">{t('collection.allTypes')}</option>
          {types.map((tp) => (
            <option key={tp} value={tp}>
              {tp}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-arena-mist mb-3">
        {t('collection.showing')}:{' '}
        <strong className="text-white">{filtered.length}</strong>
      </p>

      {error && (
        <div role="alert" className="rounded-lg border border-champion-crimson/40 bg-champion-crimson/15 p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-arena-mist">
          <div className="h-6 w-6 rounded-full border-2 border-champion-gold/30 border-t-champion-gold animate-spin" />
          {t('collection.loading')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="game-panel p-10 text-center text-arena-mist">{t('collection.empty')}</div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1.5">
          {filtered.map((card, idx) => (
            <motion.button
              key={card.id}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.01, 0.25) }}
              onClick={() => setSelected(card)}
              className={`group relative rounded-md overflow-hidden text-left transition-all duration-300 hover:scale-[1.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-champion-gold ${
                card.owned
                  ? 'border border-champion-gold/35 shadow-[0_0_10px_rgba(232,197,71,0.1)]'
                  : 'border border-white/10 opacity-90'
              }`}
              style={{
                background: card.owned
                  ? 'linear-gradient(180deg, rgba(18,26,46,0.95), rgba(12,18,32,0.98))'
                  : 'rgba(7,9,15,0.9)',
              }}
            >
              <div className="aspect-[2/3] relative bg-arena-navy">
                <CardImage
                  card={card}
                  className={`absolute inset-0 w-full h-full ${
                    card.owned ? '' : 'opacity-30 grayscale brightness-[0.45]'
                  }`}
                  {...CARD_IMAGE_GRID_PROPS}
                  fallback="/images/fundoCarta.webp"
                />
                {!card.owned && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span className="text-sm drop-shadow-lg">🔒</span>
                  </div>
                )}
                {card.owned && card.quantity > 1 && (
                  <span className="absolute top-0.5 right-0.5 rounded bg-arena-ink/90 border border-champion-gold/40 px-1 py-px text-[8px] font-bold text-champion-gold">
                    x{card.quantity}
                  </span>
                )}
                {!card.isForSale && (
                  <span className="absolute top-0.5 left-0.5 rounded bg-champion-amber/90 px-1 py-px text-[7px] font-bold uppercase tracking-wide text-arena-ink">
                    {t('collection.outsideShop')}
                  </span>
                )}
                {card.owned && (
                  <span className="absolute bottom-0.5 left-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                )}
              </div>
              <div className="px-1 py-1 border-t border-white/5">
                <p className="text-[10px] font-semibold leading-tight line-clamp-2 min-h-[1.5rem]">{card.name}</p>
                <p className={`text-[8px] mt-0.5 ${RARITY_TEXT[card.rarity] || 'text-arena-mist'}`}>
                  {card.rarity}
                </p>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center duel-modal-scrim p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              className="game-panel w-full max-w-lg overflow-hidden"
              initial={{ scale: 0.94, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid sm:grid-cols-2">
                <div className="aspect-[2/3] sm:aspect-auto sm:min-h-[320px] relative bg-arena-navy">
                  <CardImage
                    card={selected}
                    className={`absolute inset-0 w-full h-full ${selected.owned ? '' : 'opacity-40 grayscale'}`}
                    loading="eager"
                    singleLayerImage
                    objectFit="cover"
                    fallback="/images/fundoCarta.webp"
                  />
                </div>
                <div className="p-4 flex flex-col">
                  <h2 className="font-display text-xl font-bold text-champion-gold mb-1">{selected.name}</h2>
                  <p className="text-sm text-arena-mist mb-3">
                    {selected.type} ·{' '}
                    <span className={RARITY_TEXT[selected.rarity]}>{selected.rarity}</span>
                  </p>
                  {(selected.atk != null || selected.def != null || selected.level != null) && (
                    <p className="text-sm text-white/80 mb-2 tabular-nums">
                      {selected.level != null && <>Nv {selected.level} · </>}
                      {selected.atk != null && <>ATK {selected.atk} </>}
                      {selected.def != null && <>DEF {selected.def}</>}
                    </p>
                  )}
                  <p className="text-sm text-arena-mist flex-1 overflow-y-auto max-h-40 mb-4 whitespace-pre-wrap custom-scrollbar">
                    {getCardDescription(selected) || selected.description || '—'}
                  </p>
                  <div className="space-y-2 text-sm mb-4">
                    <p>
                      {selected.owned ? (
                        <span className="text-emerald-400 font-semibold">
                          ✓ {t('collection.youHave')}{' '}
                          {selected.quantity > 1 ? `(x${selected.quantity})` : ''}
                        </span>
                      ) : (
                        <span className="text-champion-amber font-semibold">
                          🔒 {t('collection.youDontHave')}
                        </span>
                      )}
                    </p>
                    <p className="text-arena-mist">
                      {selected.isForSale
                        ? t('collection.availableInShop')
                        : t('collection.onlyOutsideShop')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {selected.isForSale && (
                      <Link to="/shop" className="btn-champion flex-1 text-center text-sm py-2">
                        {t('collection.goShop')}
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="btn-secondary flex-1 text-sm py-2"
                    >
                      {t('collection.close')}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
