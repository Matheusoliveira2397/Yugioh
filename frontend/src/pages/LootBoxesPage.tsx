import GameIcon from '../components/GameIcon';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../api/axios';
import PackOpeningOverlay, { type PackOpenReward } from '../components/PackOpeningOverlay';
import { useAuthStore } from '../stores/authStore';

type Box = {
  id: string;
  name: string;
  description: string | null;
  cardsPerOpening: number;
  priceCredits: number;
  priceCash: number;
  chances: Record<string, number>;
  creditChance: number;
  creditRewards: Array<{ amount: number; weight: number }>;
  possibleCards: number;
};

function normalizeCardImage(img: unknown): string | null {
  if (img == null || typeof img !== 'string' || !img.trim()) return null;
  const s = img.trim();
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) return s;
  if (s.startsWith('images/') || s.startsWith('uploads/')) return `/${s}`;
  if (/\.(webp|jpe?g|png|gif)$/i.test(s)) return `/images/cards/${s}`;
  return s;
}

function normalizeRewards(raw: unknown[]): PackOpenReward[] {
  return (raw || []).map((item: any) => {
    if (item?.type === 'credits' || (item?.amount != null && !item?.cardId && !item?.name)) {
      return { type: 'credits' as const, amount: Number(item.amount) || 0 };
    }
    return {
      type: 'card' as const,
      cardId: String(item.cardId || item.id || ''),
      idCarta: item.idCarta ? String(item.idCarta) : undefined,
      name: String(item.name || 'Carta'),
      rarity: String(item.rarity || 'Common'),
      quantity: Math.max(1, Number(item.quantity) || 1),
      cardImage: normalizeCardImage(item.cardImage),
    };
  });
}

export default function LootBoxesPage() {
  const { user, setUser } = useAuthStore();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState('');
  const [opening, setOpening] = useState<{ packName: string; rewards: PackOpenReward[] } | null>(
    null,
  );

  const load = async () => {
    try {
      const r = await api.get<Box[]>('/loot-boxes');
      setBoxes(r.data);
    } catch {
      setError('Não foi possível carregar os pacotes');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const open = async (box: Box, method: 'credits' | 'cash') => {
    if (
      !confirm(
        'Abrir ' +
          box.name +
          ' por ' +
          (method === 'credits' ? box.priceCredits + ' créditos' : box.priceCash + ' cash') +
          '?',
      )
    )
      return;
    setLoading(box.id);
    setError('');
    try {
      const r = await api.post('/loot-boxes/' + box.id + '/open', { paymentMethod: method });
      let rewards = normalizeRewards(r.data?.rewards || []);

      const cardIds = [
        ...new Set(
          rewards
            .filter((x): x is Extract<PackOpenReward, { type: 'card' }> => x.type === 'card')
            .map((x) => x.cardId)
            .filter(Boolean),
        ),
      ];
      if (cardIds.length) {
        const details = await Promise.all(
          cardIds.map(async (id) => {
            try {
              const res = await api.get(`/cards/${id}`);
              return [id, res.data] as const;
            } catch {
              return [id, null] as const;
            }
          }),
        );
        const byId = new Map(details);
        rewards = rewards.map((rew) => {
          if (rew.type !== 'card') return rew;
          const card = byId.get(rew.cardId);
          if (!card) return rew;
          return {
            ...rew,
            idCarta: card.idCarta || rew.idCarta,
            cardImage: normalizeCardImage(card.cardImage) || rew.cardImage,
            name: card.name || rew.name,
            rarity: card.rarity || rew.rarity,
          };
        });
      }

      if (user && r.data?.remainingBalance) {
        setUser({
          ...user,
          credits: r.data.remainingBalance.credits,
          cash: r.data.remainingBalance.cash,
        });
      }
      setOpening({ packName: box.name, rewards });
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erro ao abrir pacote');
    } finally {
      setLoading('');
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-[clamp(0.75rem,2.5vw,1.5rem)] py-5 text-white">
      <header className="game-screen-hero mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="game-screen-kicker">Coleção e recompensas</p>
          <h1 className="game-screen-heading"><span className="game-screen-icon"><GameIcon route="/loot-boxes" size={27} /></span>Pacotes de Cartas</h1>
          <p className="game-screen-subtitle">
            Abra pacotes e revele cartas (ou créditos). Cada sorteio usa as chances de raridade do
            pacote.
          </p>
        </div>
        <Link
          to="/collection"
          className="text-sm text-champion-gold hover:text-champion-cyan transition-colors font-semibold"
        >
          Ver coleção →
        </Link>
      </header>

      {error && (
        <div role="alert" className="game-panel border-champion-crimson/40 bg-champion-crimson/10 p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {boxes.map((b, i) => {
          const creditChance = Number(b.creditChance) || 0;
          return (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="game-panel p-5 flex flex-col"
            >
              <div className="flex items-start gap-3 mb-3">
                <img
                  src="/images/box.png"
                  alt=""
                  className="w-14 h-14 object-contain drop-shadow-lg shrink-0"
                />
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-bold text-champion-gold leading-tight">
                    {b.name}
                  </h2>
                  {b.description && (
                    <p className="text-arena-mist text-sm mt-1 line-clamp-2">{b.description}</p>
                  )}
                </div>
              </div>

              <p className="text-sm text-white/80 mb-3">
                <span className="text-champion-cyan font-semibold">{b.cardsPerOpening}</span> drops ·{' '}
                <span className="text-champion-amber font-semibold">{b.possibleCards}</span> cartas
                possíveis
              </p>

              <div className="rounded-lg border border-white/10 bg-black/20 p-3 mb-4 flex-1">
                <h3 className="text-[10px] uppercase tracking-wider text-arena-mist font-semibold mb-2">
                  Chances por sorteio
                </h3>
                <div className="space-y-1.5">
                  {Object.entries(b.chances || {}).map(([r, p]) =>
                    Number(p) > 0 ? (
                      <div key={r} className="flex justify-between text-sm border-b border-white/5 pb-1">
                        <span className="text-white/85">{r}</span>
                        <span className="text-champion-gold tabular-nums">{Number(p).toFixed(2)}%</span>
                      </div>
                    ) : null,
                  )}
                  {creditChance > 0 && (
                    <div className="flex justify-between text-sm text-champion-amber">
                      <span>Créditos</span>
                      <span className="tabular-nums">{creditChance.toFixed(2)}%</span>
                    </div>
                  )}
                </div>
                {creditChance > 0 && b.creditRewards?.length > 0 && (
                  <p className="text-xs text-arena-mist mt-2">
                    Valores: {b.creditRewards.map((c) => c.amount).join(', ')} créditos
                  </p>
                )}
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  disabled={!!loading || b.priceCredits <= 0}
                  className="btn-champion flex-1 min-w-[140px] disabled:opacity-40"
                  onClick={() => void open(b, 'credits')}
                >
                  {b.priceCredits} créditos
                </button>
                <button
                  disabled={!!loading || b.priceCash <= 0}
                  className="btn-secondary flex-1 min-w-[140px] disabled:opacity-40 text-sm"
                  onClick={() => void open(b, 'cash')}
                >
                  {b.priceCash} cash
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {boxes.length === 0 && (
        <div className="game-panel p-8 text-center text-arena-mist">
          Nenhum pacote disponível no momento.
        </div>
      )}

      {opening && (
        <PackOpeningOverlay
          packName={opening.packName}
          rewards={opening.rewards}
          onClose={() => setOpening(null)}
        />
      )}
    </div>
  );
}
