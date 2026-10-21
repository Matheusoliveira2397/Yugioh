import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';

type EffectBoardCard = {
  name: string;
  type: string;
  monsterType?: string | null;
  spellType?: string | null;
  trapType?: string | null;
  cardImage?: string | null;
  skinCount: number;
  effectVerified: boolean;
};

function cardImageSrc(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const base = (import.meta.env.VITE_API_URL || api.defaults.baseURL || '').toString().replace(/\/$/, '');
    return base ? `${base}/cards/proxy-image?url=${encodeURIComponent(url)}` : url;
  }
  return url;
}

function subtypeLabel(c: EffectBoardCard): string {
  if (c.type === 'Monster') return c.monsterType || 'Monster';
  if (c.type === 'Spell') return c.spellType || 'Spell';
  if (c.type === 'Trap') return c.trapType || 'Trap';
  return c.type;
}

export default function AdminCardEffectsBoard() {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [pending, setPending] = useState<EffectBoardCard[]>([]);
  const [verified, setVerified] = useState<EffectBoardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draggingName, setDraggingName] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<'pending' | 'verified' | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get<{ pending: EffectBoardCard[]; verified: EffectBoardCard[] }>(
        '/cards/admin/effect-review',
        { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 },
      );
      setPending(Array.isArray(data?.pending) ? data.pending : []);
      setVerified(Array.isArray(data?.verified) ? data.verified : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erro ao carregar cartas.');
      setPending([]);
      setVerified([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const filterList = (list: EffectBoardCard[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q) ||
        subtypeLabel(c).toLowerCase().includes(q),
    );
  };

  const pendingFiltered = useMemo(() => filterList(pending), [pending, search]);
  const verifiedFiltered = useMemo(() => filterList(verified), [verified, search]);

  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  const moveCards = async (names: string[], toVerified: boolean) => {
    if (!names.length || saving) return;
    setSaving(true);
    setError(null);
    // Otimista
    const nameSet = new Set(names);
    if (toVerified) {
      const moving = pending.filter((c) => nameSet.has(c.name));
      setPending((prev) => prev.filter((c) => !nameSet.has(c.name)));
      setVerified((prev) =>
        [...moving.map((c) => ({ ...c, effectVerified: true })), ...prev].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
    } else {
      const moving = verified.filter((c) => nameSet.has(c.name));
      setVerified((prev) => prev.filter((c) => !nameSet.has(c.name)));
      setPending((prev) =>
        [...moving.map((c) => ({ ...c, effectVerified: false })), ...prev].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
    }
    try {
      await api.post(
        '/cards/admin/bulk-set-effect-verified',
        { names, effectVerified: toVerified },
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao salvar. Recarregando…');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const onDropColumn = (target: 'pending' | 'verified') => {
    if (!draggingName || !dragFrom || dragFrom === target) {
      setDraggingName(null);
      setDragFrom(null);
      return;
    }
    void moveCards([draggingName], target === 'verified');
    setDraggingName(null);
    setDragFrom(null);
  };

  const CardTile = ({
    card,
    from,
  }: {
    card: EffectBoardCard;
    from: 'pending' | 'verified';
  }) => {
    const img = cardImageSrc(card.cardImage);
    return (
      <div
        draggable={!saving}
        onDragStart={() => {
          setDraggingName(card.name);
          setDragFrom(from);
        }}
        onDragEnd={() => {
          setDraggingName(null);
          setDragFrom(null);
        }}
        className={`group flex cursor-grab items-center gap-2 rounded-lg border bg-slate-900/80 p-2 shadow transition active:cursor-grabbing ${
          draggingName === card.name
            ? 'border-amber-400 opacity-60'
            : 'border-white/10 hover:border-amber-500/50'
        }`}
        title="Arraste para a outra coluna"
      >
        <div className="h-14 w-10 flex-shrink-0 overflow-hidden rounded border border-white/20 bg-black/40">
          {img ? (
            <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-slate-500">?</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{card.name}</div>
          <div className="truncate text-[11px] text-slate-400">
            {card.type}
            {subtypeLabel(card) !== card.type ? ` · ${subtypeLabel(card)}` : ''}
            {card.skinCount > 1 ? ` · ${card.skinCount} skins` : ''}
          </div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void moveCards([card.name], from === 'pending')}
          className="flex-shrink-0 rounded px-2 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-40"
          title={from === 'pending' ? 'Marcar efeito OK' : 'Voltar para pendente'}
        >
          {from === 'pending' ? '→' : '←'}
        </button>
      </div>
    );
  };

  const Column = ({
    id,
    title,
    subtitle,
    count,
    cards,
    accent,
  }: {
    id: 'pending' | 'verified';
    title: string;
    subtitle: string;
    count: number;
    cards: EffectBoardCard[];
    accent: string;
  }) => (
    <div
      className={`flex min-h-[420px] flex-1 flex-col rounded-xl border ${accent} bg-black/30`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDropColumn(id);
      }}
    >
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="text-lg font-bold text-white">
          {title}{' '}
          <span className="text-sm font-normal text-slate-400">({count})</span>
        </h2>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: '70vh' }}>
        {cards.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {search ? 'Nenhuma carta neste filtro.' : 'Vazio — arraste cartas para cá.'}
          </p>
        ) : (
          cards.map((c) => <CardTile key={`${id}-${c.name}`} card={c} from={id} />)
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen p-4 text-white sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">✅ Efeitos das cartas ativas</h1>
            <p className="mt-1 text-sm text-slate-400">
              Arraste para a direita as cartas cujo efeito já está correto. Monstros{' '}
              <strong className="text-slate-300">Normal</strong> não entram (não precisam de efeito).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/cartas')}
              className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-medium hover:bg-slate-500"
            >
              ← Cartas
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-600"
            >
              Painel
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || saving}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium hover:bg-amber-500 disabled:opacity-50"
            >
              Atualizar
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por nome ou tipo…"
            className="min-w-[220px] flex-1 rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-amber-500/60"
          />
          <span className="text-xs text-slate-500">
            Pendente: {pending.length} · OK: {verified.length}
            {saving ? ' · salvando…' : ''}
          </span>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-900/30 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-slate-400">Carregando cartas ativas…</div>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            <Column
              id="pending"
              title="Aguardando efeito"
              subtitle="Cartas ativas ainda sem confirmação de efeito"
              count={pendingFiltered.length}
              cards={pendingFiltered}
              accent="border-slate-600/60"
            />
            <Column
              id="verified"
              title="Efeito OK"
              subtitle="Arraste para cá quando o efeito estiver correto"
              count={verifiedFiltered.length}
              cards={verifiedFiltered}
              accent="border-emerald-500/40"
            />
          </div>
        )}
      </div>
    </div>
  );
}
