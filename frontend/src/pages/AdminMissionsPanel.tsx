import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../api/axios';

type RewardType = 'none' | 'credits' | 'cash' | 'card' | 'battle_pass_xp';
type ResetType = 'none' | 'daily' | 'weekly' | 'season' | 'manual';

interface ObjectiveTypeDef {
  type: string;
  label: string;
  description: string;
  supportsMaxPosition?: boolean;
  defaultTarget: number;
}

interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  resetType: ResetType;
  startsAt: string | null;
  endsAt: string | null;
  missionsCount?: number;
}

interface ObjectiveRow {
  id?: string;
  type: string;
  targetAmount: number;
  sortOrder: number;
  meta: { maxPosition?: number };
}

interface MissionRow {
  id: string;
  categoryId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  rewardType: RewardType;
  rewardAmount: number;
  rewardCardId: string | null;
  rewardCard?: { id: string; name: string; cardImage: string } | null;
  objectives: ObjectiveRow[];
}

const emptyCategory = {
  name: '',
  description: '',
  icon: '🎯',
  sortOrder: 0,
  isActive: true,
  resetType: 'daily' as ResetType,
  startsAt: '',
  endsAt: '',
};

const emptyMission = {
  title: '',
  description: '',
  sortOrder: 0,
  isActive: true,
  rewardType: 'credits' as RewardType,
  rewardAmount: 50,
  rewardCardId: '',
};

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminMissionsPanel() {
  const navigate = useNavigate();
  const [objectiveTypes, setObjectiveTypes] = useState<ObjectiveTypeDef[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCat, setEditingCat] = useState<CategoryRow | null>(null);
  const [catForm, setCatForm] = useState(emptyCategory);

  const [showMissionForm, setShowMissionForm] = useState(false);
  const [editingMission, setEditingMission] = useState<MissionRow | null>(null);
  const [missionForm, setMissionForm] = useState(emptyMission);
  const [objectives, setObjectives] = useState<ObjectiveRow[]>([
    { type: 'WIN_ANY_DUEL', targetAmount: 1, sortOrder: 0, meta: {} },
  ]);

  const typeMap = useMemo(() => {
    const m = new Map<string, ObjectiveTypeDef>();
    for (const t of objectiveTypes) m.set(t.type, t);
    return m;
  }, [objectiveTypes]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) || null;

  const loadCategories = async () => {
    const res = await api.get('/admin/missions/categories', { timeout: 15000 });
    const list: CategoryRow[] = Array.isArray(res.data) ? res.data : [];
    setCategories(list);
    setSelectedCategoryId((prev) => {
      if (prev && list.some((c) => c.id === prev)) return prev;
      return list[0]?.id || null;
    });
  };

  const loadMissions = async (categoryId: string | null) => {
    if (!categoryId) {
      setMissions([]);
      return;
    }
    const res = await api.get('/admin/missions', {
      params: { categoryId },
      timeout: 15000,
    });
    setMissions(Array.isArray(res.data) ? res.data : []);
  };

  const bootstrap = async () => {
    try {
      setLoading(true);
      const [typesRes] = await Promise.all([
        api.get('/admin/missions/objective-types', { timeout: 15000 }),
        loadCategories(),
      ]);
      setObjectiveTypes(Array.isArray(typesRes.data) ? typesRes.data : []);
    } catch (e: any) {
      setMessage({
        type: 'error',
        text: e.response?.data?.message || 'Erro ao carregar missões',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedCategoryId) {
      loadMissions(selectedCategoryId).catch((e: any) => {
        setMessage({
          type: 'error',
          text: e.response?.data?.message || 'Erro ao carregar missões da aba',
        });
      });
    } else {
      setMissions([]);
    }
  }, [selectedCategoryId]);

  const openCreateCategory = () => {
    setEditingCat(null);
    setCatForm(emptyCategory);
    setShowCatForm(true);
  };

  const openEditCategory = (c: CategoryRow) => {
    setEditingCat(c);
    setCatForm({
      name: c.name,
      description: c.description || '',
      icon: c.icon || '🎯',
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      resetType: c.resetType || 'none',
      startsAt: toLocalInput(c.startsAt),
      endsAt: toLocalInput(c.endsAt),
    });
    setShowCatForm(true);
  };

  const saveCategory = async () => {
    try {
      const payload = {
        name: catForm.name.trim(),
        description: catForm.description.trim() || null,
        icon: catForm.icon.trim() || '🎯',
        sortOrder: Number(catForm.sortOrder) || 0,
        isActive: catForm.isActive,
        resetType: catForm.resetType,
        startsAt: catForm.startsAt || null,
        endsAt: catForm.endsAt || null,
      };
      if (!payload.name) {
        setMessage({ type: 'error', text: 'Nome da aba é obrigatório' });
        return;
      }
      if (editingCat) {
        await api.put(`/admin/missions/categories/${editingCat.id}`, payload);
        setMessage({ type: 'success', text: 'Aba atualizada' });
      } else {
        await api.post('/admin/missions/categories', payload);
        setMessage({ type: 'success', text: 'Aba criada' });
      }
      setShowCatForm(false);
      await loadCategories();
    } catch (e: any) {
      setMessage({
        type: 'error',
        text: e.response?.data?.message || 'Erro ao salvar aba',
      });
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('Excluir esta aba e todas as missões dela?')) return;
    try {
      await api.delete(`/admin/missions/categories/${id}`);
      setMessage({ type: 'success', text: 'Aba excluída' });
      await loadCategories();
    } catch (e: any) {
      setMessage({
        type: 'error',
        text: e.response?.data?.message || 'Erro ao excluir aba',
      });
    }
  };

  const openCreateMission = () => {
    if (!selectedCategoryId) return;
    setEditingMission(null);
    setMissionForm(emptyMission);
    const firstType = objectiveTypes[0]?.type || 'WIN_ANY_DUEL';
    setObjectives([
      {
        type: firstType,
        targetAmount: objectiveTypes[0]?.defaultTarget || 1,
        sortOrder: 0,
        meta: objectiveTypes[0]?.supportsMaxPosition
          ? { maxPosition: 5 }
          : {},
      },
    ]);
    setShowMissionForm(true);
  };

  const openEditMission = (m: MissionRow) => {
    setEditingMission(m);
    setMissionForm({
      title: m.title,
      description: m.description || '',
      sortOrder: m.sortOrder,
      isActive: m.isActive,
      rewardType: m.rewardType || 'none',
      rewardAmount: m.rewardAmount || 0,
      rewardCardId: m.rewardCardId || '',
    });
    setObjectives(
      (m.objectives || []).map((o, i) => ({
        id: o.id,
        type: o.type,
        targetAmount: o.targetAmount,
        sortOrder: o.sortOrder ?? i,
        meta: o.meta || {},
      })),
    );
    setShowMissionForm(true);
  };

  const addObjective = () => {
    const def = objectiveTypes[0];
    setObjectives((prev) => [
      ...prev,
      {
        type: def?.type || 'WIN_ANY_DUEL',
        targetAmount: def?.defaultTarget || 1,
        sortOrder: prev.length,
        meta: def?.supportsMaxPosition ? { maxPosition: 5 } : {},
      },
    ]);
  };

  const updateObjective = (index: number, patch: Partial<ObjectiveRow>) => {
    setObjectives((prev) =>
      prev.map((o, i) => {
        if (i !== index) return o;
        const next = { ...o, ...patch };
        if (patch.type) {
          const def = typeMap.get(patch.type);
          if (def?.supportsMaxPosition) {
            next.meta = { ...next.meta, maxPosition: next.meta?.maxPosition || 5 };
          } else {
            next.meta = {};
          }
        }
        return next;
      }),
    );
  };

  const removeObjective = (index: number) => {
    setObjectives((prev) => prev.filter((_, i) => i !== index));
  };

  const saveMission = async () => {
    if (!selectedCategoryId) return;
    try {
      if (!missionForm.title.trim()) {
        setMessage({ type: 'error', text: 'Título da missão é obrigatório' });
        return;
      }
      if (!objectives.length) {
        setMessage({ type: 'error', text: 'Adicione ao menos um objetivo' });
        return;
      }
      const payload = {
        categoryId: selectedCategoryId,
        title: missionForm.title.trim(),
        description: missionForm.description.trim() || null,
        sortOrder: Number(missionForm.sortOrder) || 0,
        isActive: missionForm.isActive,
        rewardType: missionForm.rewardType,
        rewardAmount: Number(missionForm.rewardAmount) || 0,
        rewardCardId:
          missionForm.rewardType === 'card'
            ? missionForm.rewardCardId.trim() || null
            : null,
        objectives: objectives.map((o, i) => ({
          type: o.type,
          targetAmount: Math.max(1, Number(o.targetAmount) || 1),
          sortOrder: i,
          meta: typeMap.get(o.type)?.supportsMaxPosition
            ? { maxPosition: Math.max(1, Number(o.meta?.maxPosition) || 5) }
            : {},
        })),
      };
      if (editingMission) {
        await api.put(`/admin/missions/${editingMission.id}`, payload);
        setMessage({ type: 'success', text: 'Missão atualizada' });
      } else {
        await api.post('/admin/missions', payload);
        setMessage({ type: 'success', text: 'Missão criada' });
      }
      setShowMissionForm(false);
      await loadMissions(selectedCategoryId);
      await loadCategories();
    } catch (e: any) {
      setMessage({
        type: 'error',
        text: e.response?.data?.message || 'Erro ao salvar missão',
      });
    }
  };

  const deleteMission = async (id: string) => {
    if (!confirm('Excluir esta missão?')) return;
    try {
      await api.delete(`/admin/missions/${id}`);
      setMessage({ type: 'success', text: 'Missão excluída' });
      await loadMissions(selectedCategoryId);
      await loadCategories();
    } catch (e: any) {
      setMessage({
        type: 'error',
        text: e.response?.data?.message || 'Erro ao excluir missão',
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="text-sm text-gray-400 hover:text-white mb-2"
          >
            ← Voltar ao admin
          </button>
          <h1 className="text-3xl font-bold text-white">🎯 Missões</h1>
          <p className="text-gray-400 text-sm mt-1">
            Crie abas (diárias, season, etc.) e defina missões com objetivos e recompensas.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateCategory}
          className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold"
        >
          + Nova aba
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 ${
            message.type === 'success'
              ? 'bg-emerald-900/40 border border-emerald-600 text-emerald-200'
              : 'bg-red-900/40 border border-red-600 text-red-200'
          }`}
        >
          {message.text}
          <button
            type="button"
            className="ml-3 underline text-sm"
            onClick={() => setMessage(null)}
          >
            OK
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Carregando...</p>
      ) : (
        <div className="grid lg:grid-cols-[280px_1fr] gap-6">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Abas (categorias)
            </h2>
            {categories.length === 0 && (
              <p className="text-sm text-gray-500">Nenhuma aba criada ainda.</p>
            )}
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategoryId(c.id)}
                className={`w-full text-left rounded-lg border px-3 py-3 transition-colors ${
                  selectedCategoryId === c.id
                    ? 'border-amber-500 bg-amber-900/30'
                    : 'border-gray-700 bg-gray-800/60 hover:bg-gray-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">
                    {c.icon} {c.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {c.missionsCount || 0}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2">
                  <span>{c.resetType}</span>
                  {!c.isActive && (
                    <span className="text-red-400">inativa</span>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-amber-300 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditCategory(c);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-300 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCategory(c.id);
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </button>
            ))}
          </div>

          <div>
            {selectedCategory ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      {selectedCategory.icon} {selectedCategory.name}
                    </h2>
                    <p className="text-sm text-gray-400">
                      Reset: {selectedCategory.resetType}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateMission}
                    className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
                  >
                    + Nova missão
                  </button>
                </div>

                <div className="space-y-3">
                  {missions.map((m) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-gray-700 bg-gray-800/70 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-white">
                            {m.title}
                            {!m.isActive && (
                              <span className="ml-2 text-xs text-red-400">
                                (inativa)
                              </span>
                            )}
                          </h3>
                          {m.description && (
                            <p className="text-sm text-gray-400 mt-1">
                              {m.description}
                            </p>
                          )}
                          <p className="text-xs text-amber-300 mt-2">
                            Recompensa:{' '}
                            {m.rewardType === 'battle_pass_xp'
                              ? 'XP do Passe'
                              : m.rewardType}
                            {m.rewardType !== 'none'
                              ? ` × ${m.rewardAmount}`
                              : ''}
                            {m.rewardCard?.name
                              ? ` (${m.rewardCard.name})`
                              : ''}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openEditMission(m)}
                            className="text-sm text-amber-300 hover:underline"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMission(m.id)}
                            className="text-sm text-red-300 hover:underline"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                      <ul className="mt-3 space-y-1">
                        {(m.objectives || []).map((o) => (
                          <li
                            key={o.id || `${o.type}-${o.sortOrder}`}
                            className="text-sm text-gray-300"
                          >
                            • {typeMap.get(o.type)?.label || o.type}:{' '}
                            <span className="font-mono text-gray-400">
                              {o.targetAmount}
                            </span>
                            {o.type === 'ARENA_TOP_N' && (
                              <span className="text-gray-500">
                                {' '}
                                (Top {o.meta?.maxPosition || 5})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  ))}
                  {missions.length === 0 && (
                    <p className="text-gray-500 text-sm py-8 text-center">
                      Nenhuma missão nesta aba. Crie a primeira.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-gray-500 py-12 text-center">
                Selecione ou crie uma aba à esquerda.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Modal categoria */}
      {showCatForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-xl bg-gray-900 border border-gray-700 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">
              {editingCat ? 'Editar aba' : 'Nova aba de missões'}
            </h3>
            <div className="space-y-3">
              <label className="block text-sm text-gray-300">
                Nome
                <input
                  className="mt-1 w-full rounded bg-gray-800 border border-gray-600 px-3 py-2"
                  value={catForm.name}
                  onChange={(e) =>
                    setCatForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Ex.: Missões Diárias"
                />
              </label>
              <label className="block text-sm text-gray-300">
                Descrição
                <textarea
                  className="mt-1 w-full rounded bg-gray-800 border border-gray-600 px-3 py-2"
                  value={catForm.description}
                  onChange={(e) =>
                    setCatForm((f) => ({ ...f, description: e.target.value }))
                  }
                  rows={2}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm text-gray-300">
                  Ícone
                  <input
                    className="mt-1 w-full rounded bg-gray-800 border border-gray-600 px-3 py-2"
                    value={catForm.icon}
                    onChange={(e) =>
                      setCatForm((f) => ({ ...f, icon: e.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm text-gray-300">
                  Ordem
                  <input
                    type="number"
                    className="mt-1 w-full rounded bg-gray-800 border border-gray-600 px-3 py-2"
                    value={catForm.sortOrder}
                    onChange={(e) =>
                      setCatForm((f) => ({
                        ...f,
                        sortOrder: Number(e.target.value),
                      }))
                    }
                  />
                </label>
              </div>
              <label className="block text-sm text-gray-300">
                Tipo de reset
                <select
                  className="mt-1 w-full rounded bg-gray-800 border border-gray-600 px-3 py-2"
                  value={catForm.resetType}
                  onChange={(e) =>
                    setCatForm((f) => ({
                      ...f,
                      resetType: e.target.value as ResetType,
                    }))
                  }
                >
                  <option value="none">Nenhum (permanente)</option>
                  <option value="daily">Diário</option>
                  <option value="weekly">Semanal</option>
                  <option value="season">Por season competitiva</option>
                  <option value="manual">Manual (só admin)</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm text-gray-300">
                  Início (opcional)
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded bg-gray-800 border border-gray-600 px-3 py-2"
                    value={catForm.startsAt}
                    onChange={(e) =>
                      setCatForm((f) => ({ ...f, startsAt: e.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm text-gray-300">
                  Fim (opcional)
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded bg-gray-800 border border-gray-600 px-3 py-2"
                    value={catForm.endsAt}
                    onChange={(e) =>
                      setCatForm((f) => ({ ...f, endsAt: e.target.value }))
                    }
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={catForm.isActive}
                  onChange={(e) =>
                    setCatForm((f) => ({ ...f, isActive: e.target.checked }))
                  }
                />
                Aba ativa (visível para jogadores)
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-gray-700 text-white"
                onClick={() => setShowCatForm(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-amber-600 text-white font-semibold"
                onClick={saveCategory}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal missão */}
      {showMissionForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-gray-900 border border-gray-700 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">
              {editingMission ? 'Editar missão' : 'Nova missão'}
            </h3>
            <div className="space-y-3">
              <label className="block text-sm text-gray-300">
                Título
                <input
                  className="mt-1 w-full rounded bg-gray-800 border border-gray-600 px-3 py-2"
                  value={missionForm.title}
                  onChange={(e) =>
                    setMissionForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder="Ex.: Vença 3 duelos aleatórios"
                />
              </label>
              <label className="block text-sm text-gray-300">
                Descrição
                <textarea
                  className="mt-1 w-full rounded bg-gray-800 border border-gray-600 px-3 py-2"
                  value={missionForm.description}
                  onChange={(e) =>
                    setMissionForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                  rows={2}
                />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="block text-sm text-gray-300">
                  Ordem
                  <input
                    type="number"
                    className="mt-1 w-full rounded bg-gray-800 border border-gray-600 px-3 py-2"
                    value={missionForm.sortOrder}
                    onChange={(e) =>
                      setMissionForm((f) => ({
                        ...f,
                        sortOrder: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className="block text-sm text-gray-300">
                  Recompensa
                  <select
                    className="mt-1 w-full rounded bg-gray-800 border border-gray-600 px-3 py-2"
                    value={missionForm.rewardType}
                    onChange={(e) =>
                      setMissionForm((f) => ({
                        ...f,
                        rewardType: e.target.value as RewardType,
                      }))
                    }
                  >
                    <option value="none">Nenhuma</option>
                    <option value="credits">Créditos</option>
                    <option value="cash">Cash</option>
                    <option value="card">Carta</option>
                    <option value="battle_pass_xp">XP do Passe</option>
                  </select>
                </label>
                <label className="block text-sm text-gray-300">
                  {missionForm.rewardType === 'battle_pass_xp'
                    ? 'Quantidade de XP'
                    : 'Quantidade'}
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded bg-gray-800 border border-gray-600 px-3 py-2"
                    value={missionForm.rewardAmount}
                    onChange={(e) =>
                      setMissionForm((f) => ({
                        ...f,
                        rewardAmount: Number(e.target.value),
                      }))
                    }
                  />
                  {missionForm.rewardType === 'battle_pass_xp' && (
                    <span className="mt-1 block text-[11px] text-amber-200/70">
                      Ao resgatar, o XP sobe o passe (faixa grátis e premium juntas). As
                      recompensas free/pago ficam nos níveis do Passe.
                    </span>
                  )}
                </label>
              </div>
              {missionForm.rewardType === 'card' && (
                <label className="block text-sm text-gray-300">
                  ID da carta (UUID)
                  <input
                    className="mt-1 w-full rounded bg-gray-800 border border-gray-600 px-3 py-2"
                    value={missionForm.rewardCardId}
                    onChange={(e) =>
                      setMissionForm((f) => ({
                        ...f,
                        rewardCardId: e.target.value,
                      }))
                    }
                    placeholder="uuid da carta"
                  />
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={missionForm.isActive}
                  onChange={(e) =>
                    setMissionForm((f) => ({
                      ...f,
                      isActive: e.target.checked,
                    }))
                  }
                />
                Missão ativa
              </label>

              <div className="border-t border-gray-700 pt-4 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-white">Objetivos</h4>
                  <button
                    type="button"
                    onClick={addObjective}
                    className="text-sm text-emerald-300 hover:underline"
                  >
                    + Objetivo
                  </button>
                </div>
                <div className="space-y-3">
                  {objectives.map((obj, index) => {
                    const def = typeMap.get(obj.type);
                    return (
                      <div
                        key={index}
                        className="rounded-lg border border-gray-700 bg-gray-800/50 p-3"
                      >
                        <div className="grid sm:grid-cols-[1fr_100px_auto] gap-2 items-end">
                          <label className="block text-xs text-gray-400">
                            Tipo
                            <select
                              className="mt-1 w-full rounded bg-gray-900 border border-gray-600 px-2 py-2 text-sm"
                              value={obj.type}
                              onChange={(e) =>
                                updateObjective(index, { type: e.target.value })
                              }
                            >
                              {objectiveTypes.map((t) => (
                                <option key={t.type} value={t.type}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-xs text-gray-400">
                            Quantidade
                            <input
                              type="number"
                              min={1}
                              className="mt-1 w-full rounded bg-gray-900 border border-gray-600 px-2 py-2 text-sm"
                              value={obj.targetAmount}
                              onChange={(e) =>
                                updateObjective(index, {
                                  targetAmount: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => removeObjective(index)}
                            className="text-xs text-red-300 hover:underline py-2"
                            disabled={objectives.length <= 1}
                          >
                            Remover
                          </button>
                        </div>
                        {def?.supportsMaxPosition && (
                          <label className="block text-xs text-gray-400 mt-2">
                            Posição máxima (ex.: 5 = Top 5)
                            <input
                              type="number"
                              min={1}
                              max={50}
                              className="mt-1 w-32 rounded bg-gray-900 border border-gray-600 px-2 py-2 text-sm"
                              value={obj.meta?.maxPosition || 5}
                              onChange={(e) =>
                                updateObjective(index, {
                                  meta: {
                                    ...obj.meta,
                                    maxPosition: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                        )}
                        {def?.description && (
                          <p className="text-xs text-gray-500 mt-2">
                            {def.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-gray-700 text-white"
                onClick={() => setShowMissionForm(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold"
                onClick={saveMission}
              >
                Salvar missão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
