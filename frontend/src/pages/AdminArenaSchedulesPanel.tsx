import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

interface LevelRange {
  min: number;
  max: number;
  name: string;
}

interface LevelRangeReward {
  levelRange: string;
  top1?: { cash?: number; credits?: number; cardId?: string; score?: number };
  top2?: { cash?: number; credits?: number; cardId?: string; score?: number };
  top3?: { cash?: number; credits?: number; cardId?: string; score?: number };
  top4?: { cash?: number; credits?: number; cardId?: string; score?: number };
  top5?: { cash?: number; credits?: number; cardId?: string; score?: number };
}

interface CardOption {
  id: string;
  name: string;
}

interface ArenaSchedule {
  id: string;
  name: string;
  startTime: string; // HH:mm
  durationMinutes: number;
  isActive: boolean;
  order: number;
  config?: {
    levelRanges?: LevelRange[];
    scoreMultiplier?: number;
    rewards?: {
      levelRangeRewards?: LevelRangeReward[];
    };
  };
  createdAt: string;
  updatedAt: string;
}

export default function AdminArenaSchedulesPanel() {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState<ArenaSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ArenaSchedule | null>(null);
  const [levelRanges, setLevelRanges] = useState<LevelRange[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cardSearchTarget, setCardSearchTarget] = useState<{ levelRange: string; position: number } | null>(null);
  const [cardSearchTerm, setCardSearchTerm] = useState('');
  const [cardSearchResults, setCardSearchResults] = useState<CardOption[]>([]);
  const [cardSearching, setCardSearching] = useState(false);
  const [cardDisplayNames, setCardDisplayNames] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    name: '',
    startTime: '10:00',
    durationMinutes: 120,
    isActive: true,
    order: 0,
    scoreMultiplier: 1.5,
    description: '',
    levelRangeRewards: [] as LevelRangeReward[],
  });

  useEffect(() => {
    loadSchedules();
    loadLevelRanges();
  }, []);

  const searchCardsByName = useCallback(async (term: string) => {
    if (!term || term.trim().length < 2) {
      setCardSearchResults([]);
      return;
    }
    setCardSearching(true);
    try {
      const res = await api.get<CardOption[]>('/cards', { params: { search: term.trim() } });
      setCardSearchResults(Array.isArray(res.data) ? res.data.slice(0, 15) : []);
    } catch {
      setCardSearchResults([]);
    } finally {
      setCardSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!cardSearchTarget) return;
    const t = setTimeout(() => searchCardsByName(cardSearchTerm), 300);
    return () => clearTimeout(t);
  }, [cardSearchTarget, cardSearchTerm, searchCardsByName]);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      const response = await api.get('/arena/admin/schedules');
      setSchedules(response.data);
    } catch (error) {
      console.error('Erro ao carregar horários:', error);
      setMessage({ type: 'error', text: '❌ Erro ao carregar horários' });
    } finally {
      setLoading(false);
    }
  };

  const loadLevelRanges = async () => {
    try {
      const response = await api.get('/arena/admin/config/level-ranges');
      setLevelRanges(response.data);
      // Inicializar premiações para cada faixa de nível
      if (response.data.length > 0 && formData.levelRangeRewards.length === 0) {
        setFormData(prev => ({
          ...prev,
          levelRangeRewards: response.data.map((range: LevelRange) => ({
            levelRange: range.name,
            top1: { cash: 0, credits: 0, cardId: '', score: 0 },
            top2: { cash: 0, credits: 0, cardId: '', score: 0 },
            top3: { cash: 0, credits: 0, cardId: '', score: 0 },
            top4: { cash: 0, credits: 0, cardId: '', score: 0 },
            top5: { cash: 0, credits: 0, cardId: '', score: 0 },
          })),
        }));
      }
    } catch (error) {
      console.error('Erro ao carregar faixas de nível:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const normalizeReward = (r: LevelRangeReward) => ({
        levelRange: r.levelRange,
        top1: r.top1 ? { ...r.top1, additionalScore: 0 } : undefined,
        top2: r.top2 ? { ...r.top2, additionalScore: 0 } : undefined,
        top3: r.top3 ? { ...r.top3, additionalScore: 0 } : undefined,
        top4: r.top4 ? { ...r.top4, additionalScore: 0 } : undefined,
        top5: r.top5 ? { ...r.top5, additionalScore: 0 } : undefined,
      });
      const scheduleData = {
        name: formData.name,
        startTime: formData.startTime,
        durationMinutes: formData.durationMinutes,
        isActive: formData.isActive,
        order: formData.order,
        config: {
          levelRanges: levelRanges,
          scoreMultiplier: formData.scoreMultiplier,
          description: formData.description,
          rewards: {
            levelRangeRewards: formData.levelRangeRewards.map(normalizeReward),
          },
        },
      };

      if (editingSchedule) {
        await api.put(`/arena/admin/schedules/${editingSchedule.id}`, scheduleData);
        setMessage({ type: 'success', text: '✅ Horário atualizado com sucesso!' });
      } else {
        await api.post('/arena/admin/schedules', scheduleData);
        setMessage({ type: 'success', text: '✅ Horário criado com sucesso!' });
      }

      resetForm();
      loadSchedules();
      setShowModal(false);
    } catch (error: any) {
      console.error('Erro ao salvar horário:', error);
      setMessage({
        type: 'error',
        text: `❌ Erro: ${error.response?.data?.message || error.message || 'Erro desconhecido'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (schedule: ArenaSchedule) => {
    setEditingSchedule(schedule);
    const activeRanges = schedule.config?.levelRanges || levelRanges;
    setLevelRanges(activeRanges);
    setFormData({
      name: schedule.name,
      startTime: schedule.startTime,
      durationMinutes: schedule.durationMinutes,
      isActive: schedule.isActive,
      order: schedule.order,
      scoreMultiplier: schedule.config?.scoreMultiplier || 1.5,
      description: schedule.config?.description || '',
      levelRangeRewards: schedule.config?.rewards?.levelRangeRewards || [],
    });
    setCardSearchTarget(null);
    setCardDisplayNames({});
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja deletar este horário?')) {
      return;
    }

    try {
      await api.delete(`/arena/admin/schedules/${id}`);
      setMessage({ type: 'success', text: '✅ Horário deletado com sucesso!' });
      loadSchedules();
    } catch (error: any) {
      console.error('Erro ao deletar horário:', error);
      setMessage({
        type: 'error',
        text: `❌ Erro: ${error.response?.data?.message || error.message || 'Erro desconhecido'}`,
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      startTime: '10:00',
      durationMinutes: 120,
      isActive: true,
      order: 0,
      scoreMultiplier: 1.5,
      description: '',
      levelRangeRewards: [],
    });
    setEditingSchedule(null);
  };

  const updateReward = (levelRange: string, position: number, field: 'cash' | 'credits' | 'cardId' | 'score', value: number | string) => {
    setFormData(prev => {
      const rewards = [...prev.levelRangeRewards];
      const rewardIndex = rewards.findIndex(r => r.levelRange === levelRange);
      
      if (rewardIndex === -1) {
        rewards.push({
          levelRange,
          [`top${position}`]: { [field]: value },
        } as LevelRangeReward);
      } else {
        const reward = rewards[rewardIndex];
        const topKey = `top${position}` as 'top1' | 'top2' | 'top3' | 'top4' | 'top5';
        rewards[rewardIndex] = {
          ...reward,
          [topKey]: {
            ...reward[topKey],
            [field]: value,
          },
        };
      }
      
      return { ...prev, levelRangeRewards: rewards };
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 rounded-lg p-6 mb-8 shadow-2xl">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">⏰ Horários Recorrentes de Arena</h1>
            <p className="text-gray-300">Configure horários fixos que criam arenas automaticamente todos os dias (horário de Brasília)</p>
            <p className="text-gray-400 text-sm mt-1">As arenas serão criadas automaticamente nos horários configurados abaixo</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => navigate('/admin/arena')}
              className="bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-lg font-bold transition-all"
            >
              ← Voltar
            </button>
            <button
              onClick={async () => {
                resetForm();
                setCardSearchTarget(null);
                setCardDisplayNames({});
                await loadLevelRanges();
                setShowModal(true);
              }}
              className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-bold transition-all"
            >
              ➕ Novo Horário
            </button>
          </div>
        </div>
      </div>

      {/* Mensagem */}
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-900/50 border border-green-500'
              : 'bg-red-900/50 border border-red-500'
          }`}
        >
          <p className="text-white font-semibold">{message.text}</p>
        </motion.div>
      )}

      {/* Lista de Horários */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-white text-xl">Carregando...</div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {schedules.map((schedule) => (
            <motion.div
              key={schedule.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border-2 p-6 ${
                schedule.isActive
                  ? 'border-green-500/50 hover:border-green-400'
                  : 'border-gray-500/50 hover:border-gray-400'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1">{schedule.name}</h3>
                  <p className="text-gray-400 text-sm">
                    {schedule.startTime} ({schedule.durationMinutes}min)
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    schedule.isActive
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-500 text-white'
                  }`}
                >
                  {schedule.isActive ? '✓ Ativo' : '✗ Inativo'}
                </span>
              </div>

              <div className="space-y-2 mb-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Multiplicador:</span>
                  <span className="text-white font-semibold">x{schedule.config?.scoreMultiplier || 1.5}</span>
                </div>
                {schedule.config?.description && (
                  <p className="text-gray-300 text-xs mt-2">{schedule.config.description}</p>
                )}
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => handleEdit(schedule)}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 px-3 py-2 rounded-lg text-sm font-bold text-white transition-all"
                >
                  ✏️ Editar
                </button>
                <button
                  onClick={() => handleDelete(schedule.id)}
                  className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 px-3 py-2 rounded-lg text-sm font-bold text-white transition-all"
                >
                  🗑️
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal de Horário */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-purple-500/50"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">
                {editingSchedule ? '✏️ Editar Horário' : '➕ Novo Horário Recorrente'}
              </h2>
              <button
                onClick={() => {
                  resetForm();
                  setShowModal(false);
                }}
                className="text-gray-400 hover:text-white text-2xl font-bold transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Informações Básicas */}
              <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-bold mb-4 text-purple-400">📝 Informações Básicas</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-2">Nome *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                      placeholder="Ex: Arena Manhã"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">Horário de Início (HH:mm) - Horário de Brasília *</label>
                    <input
                      type="time"
                      required
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">A arena será criada automaticamente todos os dias neste horário</p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">Duração (minutos) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.durationMinutes}
                      onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">Ordem</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.order}
                      onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-bold mb-2">Descrição</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 h-24"
                      placeholder="Descrição da arena..."
                    />
                  </div>
                </div>
              </div>

              {/* Multiplicadores */}
              <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-bold mb-4 text-purple-400">📊 Multiplicadores</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-2">Multiplicador de Score</label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      value={formData.scoreMultiplier}
                      onChange={(e) =>
                        setFormData({ ...formData, scoreMultiplier: parseFloat(e.target.value) })
                      }
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Premiações por Faixa de Nível - só faixas ativas */}
              <div className="bg-gradient-to-br from-yellow-900/50 to-orange-900/50 rounded-lg p-6 border border-yellow-500/50">
                <h3 className="text-xl font-bold mb-6 text-yellow-300">🏆 Premiações - Top 5 por Faixa de Nível</h3>
                <p className="text-gray-300 text-sm mb-4">
                  Configure as premiações para os top 5 jogadores de cada faixa de nível (apenas as faixas ativas deste horário). As premiações são distribuídas automaticamente quando a arena termina.
                </p>
                
                {levelRanges.length === 0 ? (
                  <p className="text-amber-200/80 text-sm">Nenhuma faixa de nível ativa. Ao editar, só aparecem as faixas configuradas neste horário; ao criar novo, carregue as faixas primeiro.</p>
                ) : (
                  levelRanges.map((range) => (
                    <div key={range.name} className="mb-6 bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                      <h4 className="font-bold text-lg mb-4 text-yellow-400">{range.name}</h4>
                      <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map((position) => {
                          const topKey = `top${position}` as 'top1' | 'top2' | 'top3' | 'top4' | 'top5';
                          const reward = formData.levelRangeRewards.find(r => r.levelRange === range.name)?.[topKey];
                          const cardId = reward?.cardId ?? '';
                          const cardKey = `${range.name}-${position}`;
                          const isSearchTarget = cardSearchTarget?.levelRange === range.name && cardSearchTarget?.position === position;
                          const displayName = cardDisplayNames[cardKey];
                          return (
                            <div key={position} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-bold text-yellow-300">
                                  {position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `#${position}`} {position}º Lugar
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                <div>
                                  <label className="block text-xs font-bold mb-1">💵 Cash</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={reward?.cash ?? ''}
                                    onChange={(e) => updateReward(range.name, position, 'cash', parseInt(e.target.value) || 0)}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold mb-1">🪙 Créditos</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={reward?.credits ?? ''}
                                    onChange={(e) => updateReward(range.name, position, 'credits', parseInt(e.target.value) || 0)}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-sm"
                                  />
                                </div>
                                <div className="relative">
                                  <label className="block text-xs font-bold mb-1">🃏 Carta</label>
                                  {cardId && (displayName || !isSearchTarget) ? (
                                    <div className="flex items-center gap-1">
                                      <span className="flex-1 truncate text-sm bg-gray-800 px-2 py-1 rounded border border-gray-600" title={cardId}>
                                        {displayName || cardId}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          updateReward(range.name, position, 'cardId', '');
                                          setCardDisplayNames(prev => { const next = { ...prev }; delete next[cardKey]; return next; });
                                          setCardSearchTarget({ levelRange: range.name, position });
                                          setCardSearchTerm('');
                                        }}
                                        className="text-xs text-red-400 hover:text-red-300 px-1"
                                      >
                                        Limpar
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <input
                                        type="text"
                                        placeholder="Buscar por nome..."
                                        value={isSearchTarget ? cardSearchTerm : ''}
                                        onChange={(e) => {
                                          setCardSearchTarget({ levelRange: range.name, position });
                                          setCardSearchTerm(e.target.value);
                                        }}
                                        onFocus={() => {
                                          setCardSearchTarget({ levelRange: range.name, position });
                                          if (!cardId) setCardSearchTerm('');
                                        }}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-sm"
                                      />
                                      {isSearchTarget && (cardSearchResults.length > 0 || cardSearching) && (
                                        <div className="absolute z-10 left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                          {cardSearching ? (
                                            <div className="px-2 py-2 text-xs text-gray-400">Buscando...</div>
                                          ) : (
                                            cardSearchResults.map((card) => (
                                              <button
                                                key={card.id}
                                                type="button"
                                                className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-700 truncate"
                                                onClick={() => {
                                                  updateReward(range.name, position, 'cardId', card.id);
                                                  setCardDisplayNames(prev => ({ ...prev, [cardKey]: card.name }));
                                                  setCardSearchTarget(null);
                                                  setCardSearchTerm('');
                                                  setCardSearchResults([]);
                                                }}
                                              >
                                                {card.name}
                                              </button>
                                            ))
                                          )}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                                <div>
                                  <label className="block text-xs font-bold mb-1">⭐ Score</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={reward?.score ?? ''}
                                    onChange={(e) => updateReward(range.name, position, 'score', parseInt(e.target.value) || 0)}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-sm"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Status */}
              <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-5 h-5 rounded"
                  />
                  <div>
                    <span className="text-sm font-bold block">Horário Ativo</span>
                    <span className="text-xs text-gray-400">Quando ativo, uma arena será criada automaticamente todos os dias neste horário (horário de Brasília)</span>
                  </div>
                </label>
              </div>

              {/* Botões */}
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 px-6 py-3 rounded-lg font-bold text-white transition-all disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : editingSchedule ? '💾 Atualizar' : '✅ Criar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowModal(false);
                  }}
                  className="bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-lg font-bold text-white transition-all"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

