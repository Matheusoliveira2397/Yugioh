import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../api/axios';

type RewardType = 'none' | 'credits' | 'cash' | 'card';

interface SeasonRow {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  premiumPriceCredits: number;
  xpPerWin: number;
  xpPerLoss: number;
  bannerUrl: string | null;
  levelsCount?: number;
}

interface LevelRow {
  id?: string;
  level: number;
  xpRequired: number;
  freeRewardType: RewardType;
  freeRewardAmount: number;
  freeRewardCardId: string | null;
  freeRewardCard?: { id: string; name: string; cardImage: string } | null;
  premiumRewardType: RewardType;
  premiumRewardAmount: number;
  premiumRewardCardId: string | null;
  premiumRewardCard?: { id: string; name: string; cardImage: string } | null;
}

const emptySeasonForm = {
  name: '',
  description: '',
  startsAt: '',
  endsAt: '',
  premiumPriceCredits: 500,
  xpPerWin: 100,
  xpPerLoss: 40,
  bannerUrl: '',
  isActive: false,
};

function toLocalInput(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminBattlePassPanel() {
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SeasonRow | null>(null);
  const [form, setForm] = useState(emptySeasonForm);

  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [levelsLoading, setLevelsLoading] = useState(false);
  const [genCount, setGenCount] = useState(30);
  const [genXpStep, setGenXpStep] = useState(100);

  const [grantUserId, setGrantUserId] = useState('');
  const [grantAmount, setGrantAmount] = useState(100);

  const loadSeasons = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/battle-pass/seasons', { timeout: 15000 });
      setSeasons(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      setMessage({
        type: 'error',
        text: e.response?.data?.message || 'Erro ao carregar seasons do passe',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSeasons();
  }, []);

  const resetForm = () => {
    setForm(emptySeasonForm);
    setEditing(null);
    setShowForm(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptySeasonForm);
    setShowForm(true);
  };

  const openEdit = (s: SeasonRow) => {
    setEditing(s);
    setForm({
      name: s.name,
      description: s.description || '',
      startsAt: toLocalInput(s.startsAt),
      endsAt: toLocalInput(s.endsAt),
      premiumPriceCredits: s.premiumPriceCredits,
      xpPerWin: s.xpPerWin,
      xpPerLoss: s.xpPerLoss,
      bannerUrl: s.bannerUrl || '',
      isActive: s.isActive,
    });
    setShowForm(true);
  };

  const saveSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        premiumPriceCredits: Number(form.premiumPriceCredits),
        xpPerWin: Number(form.xpPerWin),
        xpPerLoss: Number(form.xpPerLoss),
        bannerUrl: form.bannerUrl.trim() || null,
        isActive: form.isActive,
      };
      if (editing) {
        await api.put(`/admin/battle-pass/seasons/${editing.id}`, payload);
        setMessage({ type: 'success', text: 'Season atualizada.' });
      } else {
        await api.post('/admin/battle-pass/seasons', payload);
        setMessage({ type: 'success', text: 'Season criada.' });
      }
      resetForm();
      await loadSeasons();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Erro ao salvar',
      });
    }
  };

  const activateSeason = async (id: string) => {
    try {
      await api.post(`/admin/battle-pass/seasons/${id}/activate`);
      setMessage({ type: 'success', text: 'Season ativada.' });
      await loadSeasons();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Erro ao ativar' });
    }
  };

  const deleteSeason = async (id: string) => {
    if (!confirm('Excluir esta season e todos os níveis/progressos?')) return;
    try {
      await api.delete(`/admin/battle-pass/seasons/${id}`);
      if (selectedSeasonId === id) {
        setSelectedSeasonId(null);
        setLevels([]);
      }
      setMessage({ type: 'success', text: 'Season excluída.' });
      await loadSeasons();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Erro ao excluir' });
    }
  };

  const loadLevels = async (seasonId: string) => {
    setSelectedSeasonId(seasonId);
    setLevelsLoading(true);
    try {
      const res = await api.get(`/admin/battle-pass/seasons/${seasonId}/levels`);
      setLevels(Array.isArray(res.data?.levels) ? res.data.levels : []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Erro ao carregar níveis' });
      setLevels([]);
    } finally {
      setLevelsLoading(false);
    }
  };

  const generateLevels = () => {
    const next: LevelRow[] = [];
    for (let i = 1; i <= genCount; i++) {
      const isMilestone = i % 5 === 0;
      next.push({
        level: i,
        xpRequired: i * genXpStep,
        freeRewardType: isMilestone ? 'credits' : i % 2 === 0 ? 'cash' : 'none',
        freeRewardAmount: isMilestone ? 50 : i % 2 === 0 ? 20 : 0,
        freeRewardCardId: null,
        premiumRewardType: isMilestone ? 'credits' : 'cash',
        premiumRewardAmount: isMilestone ? 150 : 50,
        premiumRewardCardId: null,
      });
    }
    setLevels(next);
  };

  const updateLevel = (index: number, patch: Partial<LevelRow>) => {
    setLevels((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const saveLevels = async () => {
    if (!selectedSeasonId) return;
    setMessage(null);
    try {
      const payload = {
        levels: levels.map((l) => ({
          level: l.level,
          xpRequired: l.xpRequired,
          freeRewardType: l.freeRewardType,
          freeRewardAmount: l.freeRewardAmount,
          freeRewardCardId: l.freeRewardType === 'card' ? l.freeRewardCardId : null,
          premiumRewardType: l.premiumRewardType,
          premiumRewardAmount: l.premiumRewardAmount,
          premiumRewardCardId: l.premiumRewardType === 'card' ? l.premiumRewardCardId : null,
        })),
      };
      const res = await api.put(`/admin/battle-pass/seasons/${selectedSeasonId}/levels`, payload);
      setLevels(Array.isArray(res.data?.levels) ? res.data.levels : levels);
      setMessage({ type: 'success', text: 'Níveis salvos.' });
      await loadSeasons();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Erro ao salvar níveis',
      });
    }
  };

  const grantXp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/battle-pass/grant-xp', {
        userId: Number(grantUserId),
        amount: Number(grantAmount),
      });
      setMessage({ type: 'success', text: `XP concedido ao usuário ${grantUserId}.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Erro ao conceder XP' });
    }
  };

  const rewardFields = (
    index: number,
    track: 'free' | 'premium',
    level: LevelRow,
  ) => {
    const typeKey = track === 'free' ? 'freeRewardType' : 'premiumRewardType';
    const amountKey = track === 'free' ? 'freeRewardAmount' : 'premiumRewardAmount';
    const cardKey = track === 'free' ? 'freeRewardCardId' : 'premiumRewardCardId';
    const type = level[typeKey] as RewardType;

    return (
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={type}
          onChange={(e) =>
            updateLevel(index, { [typeKey]: e.target.value as RewardType } as Partial<LevelRow>)
          }
          className="bg-black/40 border border-white/20 rounded px-2 py-1 text-sm"
        >
          <option value="none">Nenhuma</option>
          <option value="credits">Créditos</option>
          <option value="cash">Cash</option>
          <option value="card">Carta</option>
        </select>
        {type !== 'none' && type !== 'card' && (
          <input
            type="number"
            min={0}
            value={level[amountKey]}
            onChange={(e) =>
              updateLevel(index, { [amountKey]: Number(e.target.value) } as Partial<LevelRow>)
            }
            className="w-20 bg-black/40 border border-white/20 rounded px-2 py-1 text-sm"
            placeholder="Qtd"
          />
        )}
        {type === 'card' && (
          <>
            <input
              type="text"
              value={level[cardKey] || ''}
              onChange={(e) =>
                updateLevel(index, {
                  [cardKey]: e.target.value.trim() || null,
                } as Partial<LevelRow>)
              }
              className="w-52 bg-black/40 border border-white/20 rounded px-2 py-1 text-sm"
              placeholder="UUID da carta"
            />
            <input
              type="number"
              min={1}
              value={level[amountKey] || 1}
              onChange={(e) =>
                updateLevel(index, { [amountKey]: Number(e.target.value) } as Partial<LevelRow>)
              }
              className="w-16 bg-black/40 border border-white/20 rounded px-2 py-1 text-sm"
              title="Quantidade"
            />
          </>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="text-sm text-white/60 hover:text-white mb-2"
          >
            ← Voltar ao admin
          </button>
          <h1 className="text-3xl font-bold">Passe de Batalha</h1>
          <p className="text-white/60 text-sm mt-1">
            Crie uma season por lançamento, defina níveis e recompensas (grátis + premium).
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 font-semibold"
        >
          + Nova season
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded border ${
            message.type === 'success'
              ? 'bg-emerald-900/40 border-emerald-500/40 text-emerald-100'
              : 'bg-red-900/40 border-red-500/40 text-red-100'
          }`}
        >
          {message.text}
        </div>
      )}

      {showForm && (
        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={saveSeason}
          className="mb-8 p-5 rounded-xl border border-white/15 bg-black/40 space-y-4"
        >
          <h2 className="text-xl font-semibold">{editing ? 'Editar season' : 'Nova season'}</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block text-sm">
              Nome
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full bg-black/50 border border-white/20 rounded px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Preço premium (créditos)
              <input
                type="number"
                min={0}
                value={form.premiumPriceCredits}
                onChange={(e) =>
                  setForm({ ...form, premiumPriceCredits: Number(e.target.value) })
                }
                className="mt-1 w-full bg-black/50 border border-white/20 rounded px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Início
              <input
                required
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                className="mt-1 w-full bg-black/50 border border-white/20 rounded px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Fim
              <input
                required
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                className="mt-1 w-full bg-black/50 border border-white/20 rounded px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              XP por vitória
              <input
                type="number"
                min={0}
                value={form.xpPerWin}
                onChange={(e) => setForm({ ...form, xpPerWin: Number(e.target.value) })}
                className="mt-1 w-full bg-black/50 border border-white/20 rounded px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              XP por derrota
              <input
                type="number"
                min={0}
                value={form.xpPerLoss}
                onChange={(e) => setForm({ ...form, xpPerLoss: Number(e.target.value) })}
                className="mt-1 w-full bg-black/50 border border-white/20 rounded px-3 py-2"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              Descrição
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 w-full bg-black/50 border border-white/20 rounded px-3 py-2 min-h-[70px]"
              />
            </label>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Ativar esta season (desativa as outras)
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500">
              Salvar
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded bg-white/10 hover:bg-white/20"
            >
              Cancelar
            </button>
          </div>
        </motion.form>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/10 mb-8">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">Período</th>
              <th className="p-3">Níveis</th>
              <th className="p-3">Premium</th>
              <th className="p-3">Status</th>
              <th className="p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-white/50">
                  Carregando…
                </td>
              </tr>
            ) : seasons.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-white/50">
                  Nenhuma season ainda. Crie a primeira.
                </td>
              </tr>
            ) : (
              seasons.map((s) => (
                <tr key={s.id} className="border-t border-white/10">
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 text-white/70">
                    {new Date(s.startsAt).toLocaleDateString()} —{' '}
                    {new Date(s.endsAt).toLocaleDateString()}
                  </td>
                  <td className="p-3">{s.levelsCount ?? 0}</td>
                  <td className="p-3">{s.premiumPriceCredits} créditos</td>
                  <td className="p-3">
                    {s.isActive ? (
                      <span className="text-emerald-400">Ativa</span>
                    ) : (
                      <span className="text-white/40">Inativa</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => loadLevels(s.id)}
                        className="px-2 py-1 rounded bg-amber-700/80 hover:bg-amber-600 text-xs"
                      >
                        Níveis
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-xs"
                      >
                        Editar
                      </button>
                      {!s.isActive && (
                        <button
                          type="button"
                          onClick={() => activateSeason(s.id)}
                          className="px-2 py-1 rounded bg-emerald-800/80 hover:bg-emerald-700 text-xs"
                        >
                          Ativar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteSeason(s.id)}
                        className="px-2 py-1 rounded bg-red-900/60 hover:bg-red-800 text-xs"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={grantXp}
        className="mb-8 p-4 rounded-xl border border-white/10 bg-black/30 flex flex-wrap gap-3 items-end"
      >
        <div>
          <div className="text-xs text-white/50 mb-1">Conceder XP (teste)</div>
          <input
            required
            type="number"
            placeholder="userId"
            value={grantUserId}
            onChange={(e) => setGrantUserId(e.target.value)}
            className="bg-black/50 border border-white/20 rounded px-3 py-2 w-28"
          />
        </div>
        <div>
          <div className="text-xs text-white/50 mb-1">Quantidade</div>
          <input
            required
            type="number"
            min={1}
            value={grantAmount}
            onChange={(e) => setGrantAmount(Number(e.target.value))}
            className="bg-black/50 border border-white/20 rounded px-3 py-2 w-28"
          />
        </div>
        <button type="submit" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500">
          Dar XP
        </button>
      </form>

      {selectedSeasonId && (
        <div className="rounded-xl border border-amber-500/30 bg-black/40 p-5">
          <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-950/30 px-3 py-2.5 text-sm text-amber-100/90 leading-relaxed">
            <strong className="text-amber-200">Como configurar:</strong> em cada nível, preencha a
            faixa <span className="text-emerald-300 font-semibold">Grátis</span> e a{' '}
            <span className="text-amber-300 font-semibold">Premium</span>. Todo mundo sobe de nível
            com o mesmo XP (duelos + missões com recompensa “XP do Passe”). Quem não comprou o
            premium só resgata a faixa grátis; quem comprou resgata as duas.
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold">
              Níveis — {seasons.find((s) => s.id === selectedSeasonId)?.name || selectedSeasonId}
            </h2>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="number"
                min={1}
                max={100}
                value={genCount}
                onChange={(e) => setGenCount(Number(e.target.value))}
                className="w-16 bg-black/50 border border-white/20 rounded px-2 py-1 text-sm"
                title="Qtd níveis"
              />
              <input
                type="number"
                min={1}
                value={genXpStep}
                onChange={(e) => setGenXpStep(Number(e.target.value))}
                className="w-20 bg-black/50 border border-white/20 rounded px-2 py-1 text-sm"
                title="XP por nível"
              />
              <button
                type="button"
                onClick={generateLevels}
                className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm"
              >
                Gerar base
              </button>
              <button
                type="button"
                onClick={saveLevels}
                className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-sm font-semibold"
              >
                Salvar níveis
              </button>
            </div>
          </div>

          {levelsLoading ? (
            <p className="text-white/50">Carregando níveis…</p>
          ) : levels.length === 0 ? (
            <p className="text-white/50">
              Nenhum nível. Use “Gerar base” e ajuste as recompensas.
            </p>
          ) : (
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {levels.map((lvl, index) => (
                <div
                  key={lvl.level}
                  className="grid lg:grid-cols-[70px_100px_1fr_1fr] gap-3 p-3 rounded-lg bg-white/5 border border-white/10 items-start"
                >
                  <div>
                    <div className="text-xs text-white/40">Nível</div>
                    <div className="text-lg font-bold">{lvl.level}</div>
                  </div>
                  <label className="text-xs text-white/40">
                    XP necessário
                    <input
                      type="number"
                      min={0}
                      value={lvl.xpRequired}
                      onChange={(e) =>
                        updateLevel(index, { xpRequired: Number(e.target.value) })
                      }
                      className="mt-1 w-full bg-black/40 border border-white/20 rounded px-2 py-1 text-sm text-white"
                    />
                  </label>
                  <div>
                    <div className="text-xs text-emerald-300/80 mb-1">Grátis</div>
                    {rewardFields(index, 'free', lvl)}
                  </div>
                  <div>
                    <div className="text-xs text-amber-300/80 mb-1">Premium</div>
                    {rewardFields(index, 'premium', lvl)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
