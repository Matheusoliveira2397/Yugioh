import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';

const RARITIES = ['Common', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare', 'Legendary'] as const;
type Rarity = (typeof RARITIES)[number];
type Card = { id: string; name: string; rarity: Rarity; cardImage?: string };
type Entry = { cardId: string; weight: number; quantity: number };
type CreditReward = { amount: number; weight: number };
type PackData = {
  id: string;
  name: string;
  description: string;
  cardsPerOpening: number;
  priceCredits: number;
  priceCash: number;
  isActive: boolean;
  chances: Record<Rarity, number>;
  creditChance: number;
  pool: Entry[];
  creditRewards: CreditReward[];
};

const emptyChances = (): Record<Rarity, number> => ({
  Common: 70,
  Rare: 20,
  'Super Rare': 7,
  'Ultra Rare': 2,
  'Secret Rare': 0.9,
  Legendary: 0.1,
});

const initial = (): Omit<PackData, 'id'> => ({
  name: '',
  description: '',
  cardsPerOpening: 5,
  priceCredits: 100,
  priceCash: 0,
  isActive: false,
  chances: emptyChances(),
  creditChance: 0,
  pool: [],
  creditRewards: [],
});

export default function AdminLootBoxesPanel() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [packs, setPacks] = useState<PackData[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [form, setForm] = useState(initial());
  const [editId, setEditId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [rarityFilter, setRarityFilter] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [b, c] = await Promise.all([api.get('/loot-boxes/admin'), api.get('/cards/admin/all')]);
      setPacks(
        (b.data || []).map((p: PackData) => ({
          ...p,
          creditChance: Number(p.creditChance) || 0,
          creditRewards: Array.isArray(p.creditRewards) ? p.creditRewards : [],
          pool: Array.isArray(p.pool) ? p.pool : [],
        })),
      );
      const list = Array.isArray(c.data) ? c.data : Array.isArray(c.data?.cards) ? c.data.cards : [];
      setCards(list);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erro ao carregar pacotes ou catálogo de cartas');
    }
  };

  useEffect(() => {
    if (user?.role === 'MASTER') void load();
  }, [user?.role]);

  const cardMap = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const rarityTotal = RARITIES.reduce((sum, r) => sum + Math.round(form.chances[r] * 100), 0) / 100;
  const total = Math.round((rarityTotal + Number(form.creditChance || 0)) * 100) / 100;
  const available = cards
    .filter(
      (c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) &&
        (!rarityFilter || c.rarity === rarityFilter),
    )
    .slice(0, 70);

  if (!user || user.role !== 'MASTER') return <Navigate to="/admin" replace />;

  const inputStyle = 'w-full rounded-lg bg-slate-800 border border-slate-600 text-white p-2';
  const reset = () => {
    setEditId(null);
    setForm(initial());
    setError('');
  };

  const edit = (pack: PackData) => {
    setEditId(pack.id);
    setForm({
      name: pack.name,
      description: pack.description || '',
      cardsPerOpening: pack.cardsPerOpening,
      priceCredits: pack.priceCredits,
      priceCash: pack.priceCash,
      isActive: pack.isActive,
      chances: { ...emptyChances(), ...pack.chances },
      creditChance: Number(pack.creditChance) || 0,
      pool: (pack.pool || []).map((p) => ({ ...p })),
      creditRewards: (pack.creditRewards || []).map((r) => ({ ...r })),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleCard = (cardId: string) =>
    setForm((f) => ({
      ...f,
      pool: f.pool.some((p) => p.cardId === cardId)
        ? f.pool.filter((p) => p.cardId !== cardId)
        : [...f.pool, { cardId, weight: 1, quantity: 1 }],
    }));

  const updateEntry = (cardId: string, key: 'weight' | 'quantity', value: number) =>
    setForm((f) => ({
      ...f,
      pool: f.pool.map((p) => (p.cardId === cardId ? { ...p, [key]: value } : p)),
    }));

  const addCreditReward = () =>
    setForm((f) => ({
      ...f,
      creditRewards: [...f.creditRewards, { amount: 10, weight: 1 }],
    }));

  const updateCreditReward = (index: number, key: 'amount' | 'weight', value: number) =>
    setForm((f) => ({
      ...f,
      creditRewards: f.creditRewards.map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    }));

  const removeCreditReward = (index: number) =>
    setForm((f) => ({
      ...f,
      creditRewards: f.creditRewards.filter((_, i) => i !== index),
    }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (total !== 100) {
      setError('A soma das raridades + créditos precisa ser 100%');
      return;
    }
    if (form.creditChance > 0 && !form.creditRewards.length) {
      setError('Com chance de créditos > 0, adicione ao menos um valor de crédito');
      return;
    }
    const needsCards = RARITIES.some((r) => form.chances[r] > 0);
    if (needsCards && !form.pool.length) {
      setError('Selecione ao menos uma carta para as raridades com chance');
      return;
    }
    const eligible = RARITIES.filter(
      (r) => form.chances[r] > 0 && !form.pool.some((p) => cardMap.get(p.cardId)?.rarity === r),
    );
    if (eligible.length) {
      setError('Raridade com chance e sem carta: ' + eligible.join(', '));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        creditChance: Number(form.creditChance) || 0,
        creditRewards: form.creditChance > 0 ? form.creditRewards : [],
      };
      if (editId) await api.patch('/loot-boxes/admin/' + editId, payload);
      else await api.post('/loot-boxes/admin', payload);
      setMessage('Pacote salvo com sucesso');
      reset();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const disable = async (pack: PackData) => {
    if (!confirm('Desativar ' + pack.name + '?')) return;
    try {
      await api.delete('/loot-boxes/admin/' + pack.id);
      await load();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Falha ao desativar');
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-5 text-white">
      <button className="mb-4 text-blue-300" onClick={() => navigate('/admin')}>
        ← Voltar
      </button>
      <h1 className="text-3xl font-bold mb-2">Pacotes de Cartas</h1>
      <p className="text-slate-300 mb-5">
        Configure quantos drops saem por abertura, a chance de cada raridade (comum, rara, etc.),
        cartas elegíveis com peso relativo, e opcionalmente a chance de dropar créditos em vez de
        carta. Esses pacotes ficam disponíveis para os jogadores na loja.
      </p>
      {error && (
        <p role="alert" className="rounded bg-red-900 p-3 mb-3">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded bg-green-900 p-3 mb-3">
          {message}
        </p>
      )}

      <form className="bg-slate-900 rounded-xl p-5 space-y-5" onSubmit={save}>
        <div className="grid md:grid-cols-2 gap-3">
          <label>
            Nome do pacote
            <input
              required
              className={inputStyle}
              minLength={2}
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Drops por abertura
            <input
              required
              type="number"
              min={1}
              max={50}
              className={inputStyle}
              value={form.cardsPerOpening}
              onChange={(e) => setForm({ ...form, cardsPerOpening: Number(e.target.value) })}
            />
          </label>
          <label>
            Preço em créditos (0 desabilita)
            <input
              type="number"
              min={0}
              className={inputStyle}
              value={form.priceCredits}
              onChange={(e) => setForm({ ...form, priceCredits: Number(e.target.value) })}
            />
          </label>
          <label>
            Preço em cash (0 desabilita)
            <input
              type="number"
              min={0}
              className={inputStyle}
              value={form.priceCash}
              onChange={(e) => setForm({ ...form, priceCash: Number(e.target.value) })}
            />
          </label>
          <label className="md:col-span-2">
            Descrição
            <textarea
              className={inputStyle}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
        </div>

        <h2 className="font-semibold text-xl">
          Chance por raridade{' '}
          <span className={total === 100 ? 'text-green-400' : 'text-red-400'}>
            (total {total.toFixed(2)}% — precisa 100%)
          </span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {RARITIES.map((r) => (
            <label key={r}>
              {r} (%)
              <input
                className={inputStyle}
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={form.chances[r]}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    chances: { ...f.chances, [r]: Number(e.target.value) },
                  }))
                }
              />
            </label>
          ))}
          <label className="border border-amber-600/50 rounded-lg p-2 bg-amber-950/30">
            Créditos (%)
            <input
              className={inputStyle}
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.creditChance}
              onChange={(e) => setForm({ ...form, creditChance: Number(e.target.value) })}
            />
          </label>
        </div>

        {form.creditChance > 0 && (
          <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-semibold text-lg text-amber-200">Valores de crédito possíveis</h2>
              <button
                type="button"
                className="bg-amber-700 hover:bg-amber-600 rounded px-3 py-1.5 text-sm"
                onClick={addCreditReward}
              >
                + Adicionar valor
              </button>
            </div>
            <p className="text-sm text-slate-300">
              Quando o drop cair em créditos, um destes valores é sorteado pelo peso (peso maior =
              mais comum).
            </p>
            {form.creditRewards.length === 0 && (
              <p className="text-amber-300 text-sm">Nenhum valor cadastrado ainda.</p>
            )}
            <div className="space-y-2">
              {form.creditRewards.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end bg-slate-800 p-2 rounded"
                >
                  <label>
                    Créditos
                    <input
                      className={inputStyle}
                      type="number"
                      min={1}
                      value={r.amount}
                      onChange={(e) => updateCreditReward(i, 'amount', Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Peso
                    <input
                      className={inputStyle}
                      type="number"
                      min={1}
                      value={r.weight}
                      onChange={(e) => updateCreditReward(i, 'weight', Number(e.target.value))}
                    />
                  </label>
                  <button
                    type="button"
                    className="bg-red-900 rounded px-3 py-2 md:col-span-2"
                    onClick={() => removeCreditReward(i)}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <h2 className="font-semibold text-xl">
          Cartas que podem sair ({form.pool.length} selecionadas)
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            placeholder="Buscar cartas..."
            className={inputStyle + ' flex-1'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className={inputStyle + ' max-w-52'}
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value)}
          >
            <option value="">Todas raridades</option>
            {RARITIES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="max-h-72 overflow-y-auto rounded bg-slate-800 p-2 grid md:grid-cols-2 gap-2">
          {available.map((c) => (
            <label key={c.id} className="flex items-center gap-2 rounded bg-slate-700 p-2">
              <input
                type="checkbox"
                checked={form.pool.some((p) => p.cardId === c.id)}
                onChange={() => toggleCard(c.id)}
              />
              <span>
                {c.name} <small className="text-slate-300">({c.rarity})</small>
              </span>
            </label>
          ))}
        </div>
        <p className="text-sm text-slate-300">
          Peso: chance relativa entre cartas da mesma raridade. Quantidade: cópias entregues quando
          a carta é sorteada.
        </p>
        <div className="max-h-72 overflow-y-auto space-y-2">
          {form.pool.map((p) => (
            <div
              key={p.cardId}
              className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end bg-slate-800 p-2 rounded"
            >
              <span className="col-span-2">{cardMap.get(p.cardId)?.name || p.cardId}</span>
              <label>
                Peso
                <input
                  className={inputStyle}
                  type="number"
                  min={1}
                  max={100000}
                  value={p.weight}
                  onChange={(e) => updateEntry(p.cardId, 'weight', Number(e.target.value))}
                />
              </label>
              <label>
                Quantidade
                <input
                  className={inputStyle}
                  type="number"
                  min={1}
                  max={100}
                  value={p.quantity}
                  onChange={(e) => updateEntry(p.cardId, 'quantity', Number(e.target.value))}
                />
              </label>
            </div>
          ))}
        </div>

        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          Disponível para jogadores
        </label>
        <div className="flex gap-3">
          <button
            disabled={saving || total !== 100 || (RARITIES.some((r) => form.chances[r] > 0) && !form.pool.length)}
            className="bg-indigo-600 rounded px-5 py-3 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar pacote'}
          </button>
          {editId && (
            <button type="button" className="bg-slate-700 rounded px-4" onClick={reset}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <h2 className="text-xl font-semibold mt-8 mb-3">Pacotes cadastrados</h2>
      <div className="space-y-2">
        {packs.map((b) => (
          <div
            key={b.id}
            className="bg-slate-900 rounded p-4 flex justify-between flex-wrap gap-3"
          >
            <div>
              <strong>{b.name}</strong> — {b.cardsPerOpening} drops ·{' '}
              {b.isActive ? 'Ativo' : 'Desativado'}
              <p className="text-sm text-slate-400">
                {b.pool.length} cartas · chance créditos {Number(b.creditChance || 0)}% ·{' '}
                {b.priceCredits} créditos / {b.priceCash} cash
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => edit(b)} className="bg-blue-700 rounded px-3">
                Editar
              </button>
              <button onClick={() => void disable(b)} className="bg-red-800 rounded px-3">
                Desativar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
