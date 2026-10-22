import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';

interface LevelRange {
  min: number;
  max: number;
  name: string;
}

export interface ArenaTop5Reward {
  cash?: number;
  credits?: number;
  cardId?: string;
  score?: number;
  additionalScore?: number;
}

interface ArenaRewards {
  top5Rewards?: {
    top1?: ArenaTop5Reward;
    top2?: ArenaTop5Reward;
    top3?: ArenaTop5Reward;
    top4?: ArenaTop5Reward;
    top5?: ArenaTop5Reward;
  };
  levelRangeRewards?: Array<{
    levelRange: string;
    top1?: ArenaTop5Reward;
    top2?: ArenaTop5Reward;
    top3?: ArenaTop5Reward;
    top4?: ArenaTop5Reward;
    top5?: ArenaTop5Reward;
  }>;
}

interface CardOption {
  id: string;
  name: string;
  idCarta?: string;
}

interface ChallengeArena {
  id: string;
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  participants: number;
  scoreMultiplier: number;
  config?: {
    levelRanges?: LevelRange[];
    rewards?: ArenaRewards;
    dailyStartTime?: string;
    durationMinutes?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export default function AdminArenaPanel() {
  const { user } = useAuthStore();
  const [arenas, setArenas] = useState<ChallengeArena[]>([]);
  const [loading, setLoading] = useState(true);

  // Proteção: apenas ADMIN ou MASTER
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }
  const [showArenaModal, setShowArenaModal] = useState(false);
  const [showLevelRangesModal, setShowLevelRangesModal] = useState(false);
  const [editingArena, setEditingArena] = useState<ChallengeArena | null>(null);
  const [levelRanges, setLevelRanges] = useState<LevelRange[]>([]);
  const [cards, setCards] = useState<CardOption[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state: Criar Arena = sempre recorrente (repete todo dia no horário de Brasília)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    scoreMultiplier: 1.5,
    dailyStartTime: '15:00', // Horário de Brasília (HH:mm)
    durationMinutes: 120,
    selectedLevelRanges: [] as string[],
    rewards: {
      top5Rewards: {
        top1: { cash: 0, credits: 0, cardId: '' as string, score: 0 },
        top2: { cash: 0, credits: 0, cardId: '', score: 0 },
        top3: { cash: 0, credits: 0, cardId: '', score: 0 },
        top4: { cash: 0, credits: 0, cardId: '', score: 0 },
        top5: { cash: 0, credits: 0, cardId: '', score: 0 },
      },
    },
  });

  useEffect(() => {
    loadArenas();
    loadLevelRanges();
  }, []);

  const loadArenas = async () => {
    try {
      const response = await api.get('/arena/admin/all');
      setArenas(response.data);
    } catch (error) {
      console.error('Erro ao carregar arenas:', error);
      setMessage({ type: 'error', text: '❌ Erro ao carregar arenas' });
    } finally {
      setLoading(false);
    }
  };

  const loadLevelRanges = async () => {
    try {
      const response = await api.get('/arena/admin/config/level-ranges');
      setLevelRanges(response.data);
    } catch (error) {
      console.error('Erro ao carregar faixas de nível:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.selectedLevelRanges.length === 0) {
      setMessage({ type: 'error', text: '❌ Selecione pelo menos uma faixa de nível.' });
      return;
    }
    setLoading(true);
    setMessage(null);

    try {
      const top5 = formData.rewards.top5Rewards;
      const isRecurring = editingArena ? (editingArena.config as any)?.isRecurring !== false : true;
      const reward = (key: 'top1'|'top2'|'top3'|'top4'|'top5') => ({
        cash: top5[key].cash || 0,
        credits: top5[key].credits || 0,
        cardId: top5[key].cardId || undefined,
        score: top5[key].score ?? 0,
      });
      const arenaData = {
        name: formData.name,
        description: formData.description,
        startTime: null,
        endTime: null,
        scoreMultiplier: formData.scoreMultiplier,
        config: {
          levelRanges: levelRanges.filter(range => formData.selectedLevelRanges.includes(range.name)),
          rewards: {
            top5Rewards: {
              top1: reward('top1'),
              top2: reward('top2'),
              top3: reward('top3'),
              top4: reward('top4'),
              top5: reward('top5'),
            },
            levelRangeRewards: formData.selectedLevelRanges.length > 0 ? formData.selectedLevelRanges.map(rangeName => ({
              levelRange: rangeName,
              top1: reward('top1'),
              top2: reward('top2'),
              top3: reward('top3'),
              top4: reward('top4'),
              top5: reward('top5'),
            })) : [],
          },
          isRecurring,
          dailyStartTime: formData.dailyStartTime,
          durationMinutes: formData.durationMinutes,
        },
      };

      if (editingArena) {
        await api.put(`/arena/admin/${editingArena.id}`, arenaData);
        setMessage({ type: 'success', text: '✅ Arena atualizada com sucesso!' });
      } else {
        await api.post('/arena/admin/create', arenaData);
        setMessage({ type: 'success', text: '✅ Arena criada com sucesso!' });
      }

      resetForm();
      loadArenas();
      setShowArenaModal(false);
    } catch (error: any) {
      console.error('Erro ao salvar arena:', error);
      setMessage({
        type: 'error',
        text: `❌ Erro: ${error.response?.data?.message || error.message || 'Erro desconhecido'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (arena: ChallengeArena) => {
    setEditingArena(arena);
    const config = arena.config || {};
    const rewards = config.rewards || {};
    const src = rewards.top5Rewards || (rewards.levelRangeRewards && rewards.levelRangeRewards[0]) || {};
    const r = (key: 'top1'|'top2'|'top3'|'top4'|'top5') => ({
      cash: src[key]?.cash ?? 0,
      credits: src[key]?.credits ?? 0,
      cardId: src[key]?.cardId ?? '',
      score: src[key]?.score ?? 0,
    });
    setFormData({
      name: arena.name,
      description: arena.description || '',
      scoreMultiplier: arena.scoreMultiplier,
      dailyStartTime: config.dailyStartTime || '15:00',
      durationMinutes: config.durationMinutes || 120,
      selectedLevelRanges: (config.levelRanges || []).map((r: LevelRange) => r.name),
      rewards: {
        top5Rewards: {
          top1: r('top1'),
          top2: r('top2'),
          top3: r('top3'),
          top4: r('top4'),
          top5: r('top5'),
        },
      },
    });
    setShowArenaModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente deletar esta arena?')) return;

    try {
      await api.delete(`/arena/admin/${id}`);
      setMessage({ type: 'success', text: '✅ Arena deletada com sucesso!' });
      loadArenas();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `❌ Erro: ${error.response?.data?.message || error.message}`,
      });
    }
  };

  const handleSaveLevelRanges = async () => {
    try {
      await api.put('/arena/admin/config/level-ranges', levelRanges);
      setMessage({ type: 'success', text: '✅ Faixas de nível atualizadas com sucesso!' });
      setShowLevelRangesModal(false);
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `❌ Erro: ${error.response?.data?.message || error.message}`,
      });
    }
  };

  const addLevelRange = () => {
    setLevelRanges([
      ...levelRanges,
      { min: 1, max: 1, name: `Nível ${levelRanges.length + 1}` },
    ]);
  };

  const removeLevelRange = (index: number) => {
    setLevelRanges(levelRanges.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      scoreMultiplier: 1.5,
      dailyStartTime: '15:00',
      durationMinutes: 120,
      selectedLevelRanges: [],
      rewards: {
        top5Rewards: {
          top1: { cash: 0, credits: 0, cardId: '', score: 0 },
          top2: { cash: 0, credits: 0, cardId: '', score: 0 },
          top3: { cash: 0, credits: 0, cardId: '', score: 0 },
          top4: { cash: 0, credits: 0, cardId: '', score: 0 },
          top5: { cash: 0, credits: 0, cardId: '', score: 0 },
        },
      },
    });
    setEditingArena(null);
  };

  const loadCards = async () => {
    setCardsLoading(true);
    try {
      const res = await api.get<CardOption[]>('/cards/admin/all');
      setCards(Array.isArray(res.data) ? res.data : []);
    } catch {
      setCards([]);
    } finally {
      setCardsLoading(false);
    }
  };

  const toggleLevelRange = (rangeName: string) => {
    setFormData(prev => ({
      ...prev,
      selectedLevelRanges: prev.selectedLevelRanges.includes(rangeName)
        ? prev.selectedLevelRanges.filter(name => name !== rangeName)
        : [...prev.selectedLevelRanges, rangeName],
    }));
  };

  const updateTop5Reward = (position: number, field: 'cash' | 'credits' | 'cardId' | 'score', value: number | string) => {
    setFormData(prev => {
      const topKey = `top${position}` as 'top1' | 'top2' | 'top3' | 'top4' | 'top5';
      return {
        ...prev,
        rewards: {
          ...prev.rewards,
          top5Rewards: {
            ...prev.rewards.top5Rewards,
            [topKey]: {
              ...prev.rewards.top5Rewards[topKey],
              [field]: value,
            },
          },
        },
      };
    });
  };

  useEffect(() => {
    if (showArenaModal && cards.length === 0 && !cardsLoading) loadCards();
  }, [showArenaModal]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 rounded-lg p-6 mb-8 shadow-2xl">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">🏟️ Gerenciamento de Arena de Duelos</h1>
            <p className="text-gray-300">Configure faixas de nível, horários e premiações</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link
              to="/admin/arena/schedules"
              className="bg-amber-600 hover:bg-amber-700 px-6 py-3 rounded-lg font-bold transition-all inline-block"
            >
              ⏰ Criar Horário (cria a arena automaticamente)
            </Link>
            <button
              onClick={() => setShowLevelRangesModal(true)}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-bold transition-all"
            >
              ⚙️ Configurar Faixas de Nível
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

      {/* Modal de Arena */}
      {showArenaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-800 rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-purple-500/50"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">✏️ Editar Arena</h2>
              <button
                onClick={() => {
                  resetForm();
                  setShowArenaModal(false);
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
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold mb-2">Nome da Arena *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                      placeholder="Ex: Arena Noturna"
                    />
                  </div>
                  <div>
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

              {/* Horário: arena repete todo dia no mesmo horário (Brasília) */}
              <div className="bg-gradient-to-br from-blue-900/50 to-indigo-900/50 rounded-lg p-6 border border-blue-500/50">
                <h3 className="text-lg font-bold mb-2 text-blue-300">🕐 Horário (Brasília)</h3>
                <p className="text-gray-300 text-sm mb-4">
                  A arena se repete todos os dias no mesmo horário.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-2">Início (HH:mm) *</label>
                    <input
                      type="time"
                      required
                      value={formData.dailyStartTime}
                      onChange={(e) => setFormData({ ...formData, dailyStartTime: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">Duração (minutos) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.durationMinutes}
                      onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) || 120 })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
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

              {/* Seleção de Faixas de Níveis */}
              <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-bold mb-4 text-purple-400">📊 Faixas de Níveis</h3>
                <p className="text-gray-300 text-sm mb-4">
                  Selecione as faixas de níveis que poderão participar desta arena. Os jogadores só enfrentarão outros da mesma faixa.
                </p>
                <p className="text-yellow-400 text-xs mb-4 bg-yellow-900/20 p-2 rounded border border-yellow-700/50">
                  ⚠️ <strong>Importante:</strong> Após selecionar as faixas, configure a premiação única para o Top 5 abaixo. A mesma premiação será aplicada automaticamente a todas as faixas selecionadas.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {levelRanges.map((range) => (
                    <label
                      key={range.name}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        formData.selectedLevelRanges.includes(range.name)
                          ? 'bg-purple-900/50 border-purple-500'
                          : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.selectedLevelRanges.includes(range.name)}
                        onChange={() => toggleLevelRange(range.name)}
                        className="w-5 h-5 rounded"
                      />
                      <span className="font-bold text-white">{range.name}</span>
                      <span className="text-xs text-gray-400">(Nível {range.min}-{range.max})</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Premiação Top 5 por faixa: Cash, Crédito e/ou Carta */}
              <div className="bg-gradient-to-br from-yellow-900/50 to-orange-900/50 rounded-lg p-6 border border-yellow-500/50">
                <h3 className="text-xl font-bold mb-2 text-yellow-300">🏆 Premiação Top 5</h3>
                <p className="text-gray-300 text-sm mb-4">
                  Para cada faixa de nível, o top 5 recebe estas premiações. Cash, Crédito, Score (pontos no geral) e/ou Carta por posição.
                </p>
                <div className="space-y-3">
                  {([1, 2, 3, 4, 5] as const).map((position) => {
                    const topKey = `top${position}` as 'top1'|'top2'|'top3'|'top4'|'top5';
                    const r = formData.rewards.top5Rewards[topKey];
                    return (
                      <div key={position} className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-lg font-bold text-yellow-300">
                            {position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `#${position}`} {position}º Lugar
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs font-bold mb-1">💵 Cash</label>
                            <input
                              type="number"
                              min="0"
                              value={r?.cash ?? 0}
                              onChange={(e) => updateTop5Reward(position, 'cash', parseInt(e.target.value) || 0)}
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold mb-1">💎 Crédito</label>
                            <input
                              type="number"
                              min="0"
                              value={r?.credits ?? 0}
                              onChange={(e) => updateTop5Reward(position, 'credits', parseInt(e.target.value) || 0)}
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold mb-1">📊 Score</label>
                            <input
                              type="number"
                              min="0"
                              value={r?.score ?? 0}
                              onChange={(e) => updateTop5Reward(position, 'score', parseInt(e.target.value) || 0)}
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold mb-1">🃏 Carta</label>
                            <select
                              value={r?.cardId ?? ''}
                              onChange={(e) => updateTop5Reward(position, 'cardId', e.target.value)}
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                            >
                              <option value="">Nenhuma</option>
                              {cardsLoading ? (
                                <option disabled>Carregando...</option>
                              ) : (
                                cards.map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))
                              )}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Botões */}
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowArenaModal(false);
                  }}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : '💾 Atualizar'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal de Faixas de Nível */}
      {showLevelRangesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-blue-500/50"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">⚙️ Configurar Faixas de Nível</h2>
              <button
                onClick={() => setShowLevelRangesModal(false)}
                className="text-gray-400 hover:text-white text-2xl font-bold transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {levelRanges.map((range, index) => (
                <div
                  key={index}
                  className="bg-gray-900/50 rounded-lg p-4 border border-gray-700"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex-1 grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold mb-1">Nível Mínimo</label>
                        <input
                          type="number"
                          min="1"
                          value={range.min}
                          onChange={(e) => {
                            const newRanges = [...levelRanges];
                            newRanges[index].min = parseInt(e.target.value) || 1;
                            setLevelRanges(newRanges);
                          }}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1">Nível Máximo</label>
                        <input
                          type="number"
                          min="1"
                          value={range.max}
                          onChange={(e) => {
                            const newRanges = [...levelRanges];
                            newRanges[index].max = parseInt(e.target.value) || 1;
                            setLevelRanges(newRanges);
                          }}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1">Nome da Faixa</label>
                        <input
                          type="text"
                          value={range.name}
                          onChange={(e) => {
                            const newRanges = [...levelRanges];
                            newRanges[index].name = e.target.value;
                            setLevelRanges(newRanges);
                          }}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                          placeholder="Ex: Nível 1-5"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => removeLevelRange(index)}
                      className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-bold text-sm"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-4">
              <button
                onClick={addLevelRange}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg"
              >
                ➕ Adicionar Faixa
              </button>
              <button
                onClick={handleSaveLevelRanges}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg"
              >
                💾 Salvar Configurações
              </button>
              <button
                onClick={() => setShowLevelRangesModal(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Listagem de Arenas */}
      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
          <p className="text-2xl text-gray-300">⏳ Carregando arenas...</p>
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
            📋 Arenas Fixas
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            Arenas que você criou. Cada uma abre automaticamente todo dia no horário configurado (até 10 min antes aparece o banner; ao abrir, todos recebem notificação). Ao terminar, a próxima edição abre no mesmo horário no dia seguinte.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {arenas.filter((a) => ((a.config || {}) as { isRecurring?: boolean }).isRecurring === true).map((arena, index) => {
            const config = (arena.config || {}) as { isRecurring?: boolean; dailyStartTime?: string; durationMinutes?: number };
            const isTemplate = config.isRecurring === true;
            const now = new Date();
            const startTime = new Date(arena.startTime);
            const endTime = new Date(arena.endTime);
            const isActive = !isTemplate && startTime <= now && endTime > now;
            const isPast = !isTemplate && endTime < now;
            const isFuture = !isTemplate && startTime > now;

            return (
              <motion.div
                key={arena.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                whileHover={{ y: -8, scale: 1.02 }}
                className={`group relative bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl overflow-hidden shadow-2xl border-2 transition-all duration-300 ${
                  isTemplate
                    ? 'border-amber-500/50 hover:border-amber-400'
                    : isActive
                    ? 'border-green-500/50 hover:border-green-400'
                    : isPast
                    ? 'border-gray-500/50 hover:border-gray-400'
                    : 'border-blue-500/50 hover:border-blue-400'
                }`}
              >
                {/* Badge de Status */}
                <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 items-end">
                  {isTemplate ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-600 text-white">📋 MODELO</span>
                  ) : (
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold shadow-lg ${
                        isActive ? 'bg-green-500 text-white' : isPast ? 'bg-gray-500 text-white' : 'bg-blue-500 text-white'
                      }`}
                    >
                      {isActive ? '✓ ATIVA' : isPast ? '✗ FINALIZADA' : '⏳ AGENDADA'}
                    </span>
                  )}
                </div>

                {/* Conteúdo */}
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-white mb-2">{arena.name}</h3>
                  {arena.description && (
                    <p className="text-gray-400 text-sm mb-4">{arena.description}</p>
                  )}

                  <div className="space-y-3 mb-4">
                    {isTemplate ? (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">🕐 Repete todo dia:</span>
                          <span className="text-white font-semibold">{config.dailyStartTime || '—'} (Brasília)</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">⏱️ Duração:</span>
                          <span className="text-white font-semibold">{config.durationMinutes ?? 0} min</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">⏰ Início:</span>
                          <span className="text-white font-semibold">{formatDate(arena.startTime)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">⏰ Término:</span>
                          <span className="text-white font-semibold">{formatDate(arena.endTime)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">👥 Participantes:</span>
                      <span className="text-white font-semibold">{arena.participants}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">📊 Multiplicador:</span>
                      <span className="text-white font-semibold">x{arena.scoreMultiplier}</span>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => handleEdit(arena)}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 px-3 py-2.5 rounded-lg text-sm font-bold text-white transition-all"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => handleDelete(arena.id)}
                      className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 px-3 py-2.5 rounded-lg text-sm font-bold text-white transition-all"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
          </div>
        </>
      )}

      {arenas.filter((a) => ((a.config || {}) as { isRecurring?: boolean }).isRecurring === true).length === 0 && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border-2 border-slate-700"
        >
          <div className="text-8xl mb-6 animate-bounce">🏟️</div>
          <p className="text-3xl font-bold text-gray-300 mb-3">Nenhuma arena</p>
          <p className="text-gray-400 mb-6">Crie um horário em &quot;Horários de Arena&quot; para que a arena seja criada automaticamente e abra no horário escolhido.</p>
          <Link
            to="/admin/arena/schedules"
            className="inline-block bg-amber-600 hover:bg-amber-700 px-6 py-3 rounded-lg font-bold text-white"
          >
            ⏰ Criar Horário
          </Link>
        </motion.div>
      )}
    </div>
  );
}
