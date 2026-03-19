import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

interface CardOwnershipRow {
  cardId: string;
  name: string;
  cardImage: string | null;
  ownerCount: number;
  totalQuantity: number;
}

interface CardOwner {
  userId: number;
  nickname: string;
  username: string;
  totalQuantity: number;
}

function cardImageSrc(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const base = (import.meta.env.VITE_API_URL || api.defaults.baseURL || '').toString().replace(/\/$/, '');
    return base ? `${base}/cards/proxy-image?url=${encodeURIComponent(url)}` : url;
  }
  return url;
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

type SortKey = 'ownerCount' | 'name' | 'totalQuantity';
type SortDir = 'asc' | 'desc';

export default function AdminCardOwnershipPanel() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CardOwnershipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('ownerCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [totalUserCardRows, setTotalUserCardRows] = useState<number | undefined>(undefined);
  const [selectedCard, setSelectedCard] = useState<CardOwnershipRow | null>(null);
  const [owners, setOwners] = useState<CardOwner[]>([]);
  const [loadingOwners, setLoadingOwners] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get<{ list: CardOwnershipRow[]; totalUserCardRows?: number }>('/admin/cards/ownership-stats');
        const list = data?.list ?? (Array.isArray(data) ? (data as unknown as CardOwnershipRow[]) : []);
        if (!cancelled) {
          setRows(list);
          setTotalUserCardRows(data?.totalUserCardRows);
        }
      } catch (e) {
        console.error('Erro ao carregar posse de cartas:', e);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = normalize(search.trim());
    return rows.filter((r) => normalize(r.name).includes(q));
  }, [rows, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'ownerCount') cmp = a.ownerCount - b.ownerCount;
      else if (sortKey === 'totalQuantity') cmp = a.totalQuantity - b.totalQuantity;
      else cmp = a.name.localeCompare(b.name, 'pt');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const handleCardClick = async (row: CardOwnershipRow) => {
    setSelectedCard(row);
    setOwners([]);
    setLoadingOwners(true);
    try {
      const { data } = await api.get<CardOwner[]>(`/admin/cards/${encodeURIComponent(row.cardId)}/owners`);
      setOwners(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Erro ao carregar duelistas:', e);
      setOwners([]);
    } finally {
      setLoadingOwners(false);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-5">
      <div className="max-w-5xl mx-auto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="text-slate-400 hover:text-white text-sm"
            >
              ← Voltar
            </button>
            <h1 className="text-xl font-bold text-white">
              Quantas pessoas têm cada carta
            </h1>
          </div>
        </div>

        <div className="rounded-xl bg-black/20 border border-white/10 p-4">
          <p className="text-slate-400 text-sm mb-3">
            Apenas cartas que pelo menos uma pessoa possui aparecem. Ordenado por quantidade de donos.
            {totalUserCardRows !== undefined && (
              <span className="block mt-1 text-amber-200/90">
                Total de registros na maleta (user_cards): <strong>{totalUserCardRows}</strong>
                {totalUserCardRows === 0 && rows.length === 0 && ' — Se duelistas têm cartas, verifique se as cartas estão no inventário (maleta) e não só nos decks.'}
              </span>
            )}
          </p>

          <div className="mb-4">
            <label htmlFor="card-ownership-search" className="sr-only">Buscar carta</label>
            <input
              id="card-ownership-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome da carta..."
              className="w-full max-w-md px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-sm"
            />
          </div>

          {loading ? (
            <p className="text-slate-400 py-8 text-center">Carregando...</p>
          ) : sorted.length === 0 ? (
            <p className="text-slate-400 py-8 text-center">
              {rows.length === 0
                ? 'Nenhuma carta com donos no momento.'
                : 'Nenhuma carta encontrada para essa busca.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="pb-2 pr-2 font-medium">Carta</th>
                    <th className="pb-2 px-2 font-medium w-28">
                      <button
                        type="button"
                        onClick={() => toggleSort('ownerCount')}
                        className="hover:text-white flex items-center gap-1"
                      >
                        Pessoas
                        {sortKey === 'ownerCount' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                      </button>
                    </th>
                    <th className="pb-2 px-2 font-medium w-32">
                      <button
                        type="button"
                        onClick={() => toggleSort('totalQuantity')}
                        className="hover:text-white flex items-center gap-1"
                      >
                        Total cópias
                        {sortKey === 'totalQuantity' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr
                      key={r.cardId}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleCardClick(r)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(r); } }}
                      className="border-b border-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                    >
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-14 rounded overflow-hidden bg-white/5 flex-shrink-0 border border-white/10">
                            {r.cardImage ? (
                              <img
                                src={cardImageSrc(r.cardImage)}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                                —
                              </div>
                            )}
                          </div>
                          <span className="text-white font-medium">{r.name}</span>
                          <span className="text-slate-500 text-xs">(clique para ver duelistas)</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-white font-semibold">
                        {r.ownerCount}
                      </td>
                      <td className="py-2 px-2 text-slate-300">
                        {r.totalQuantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && sorted.length > 0 && (
            <p className="text-slate-500 text-xs mt-3">
              {sorted.length} carta(s) listada(s)
              {search.trim() ? ` (filtro: "${search}")` : ''}
            </p>
          )}
        </div>

        {/* Modal: duelistas que têm a carta */}
        {selectedCard && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
            onClick={() => setSelectedCard(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="owners-modal-title"
          >
            <div
              className="bg-slate-900 border border-white/20 rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-white/10 flex items-center gap-3 flex-shrink-0">
                <div className="w-12 h-16 rounded overflow-hidden bg-white/5 border border-white/10 flex-shrink-0">
                  {selectedCard.cardImage ? (
                    <img src={cardImageSrc(selectedCard.cardImage)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">—</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 id="owners-modal-title" className="text-lg font-bold text-white truncate">{selectedCard.name}</h2>
                  <p className="text-slate-400 text-sm">{selectedCard.ownerCount} duelista(s) com esta carta</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCard(null)}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                {loadingOwners ? (
                  <p className="text-slate-400 text-center py-6">Carregando...</p>
                ) : owners.length === 0 ? (
                  <p className="text-slate-400 text-center py-6">Nenhum duelista encontrado.</p>
                ) : (
                  <ul className="space-y-2">
                    {owners.map((o) => (
                      <li
                        key={o.userId}
                        className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-white/5 border border-white/5"
                      >
                        <div>
                          <span className="font-medium text-white">{o.nickname}</span>
                          <span className="text-slate-500 text-sm ml-2">@{o.username}</span>
                        </div>
                        <span className="text-slate-300 font-semibold">{o.totalQuantity} {o.totalQuantity === 1 ? 'cópia' : 'cópias'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
