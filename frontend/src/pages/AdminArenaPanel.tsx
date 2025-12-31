import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';

interface LevelRange {
  min: number;
  max: number;
  name: string;
}

interface ArenaRewards {
  top1?: { credits?: number; gems?: number; cash?: number };
  top3?: { credits?: number; gems?: number; cash?: number };
  top10?: { credits?: number; gems?: number; cash?: number };
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
  bonusGems: number;
  config?: {
    levelRanges?: LevelRange[];
    rewards?: ArenaRewards;
  };
  createdAt: string;
  updatedAt: string;
}

export default function AdminArenaPanel() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
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
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startTime: '',
    endTime: '',
    scoreMultiplier: 1.5,
    bonusGems: 50,
    rewards: {
      top1: { credits: 0, gems: 0, cash: 0 },
      top3: { credits: 0, gems: 0, cash: 0 },
      top10: { credits: 0, gems: 0, cash: 0 },
    } as ArenaRewards,
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
    setLoading(true);
    setMessage(null);

    try {
      const arenaData = {
        name: formData.name,
        description: formData.description,
        startTime: new Date(formData.startTime).toISOString(),
        endTime: new Date(formData.endTime).toISOString(),
        scoreMultiplier: formData.scoreMultiplier,
        bonusGems: formData.bonusGems,
        config: {
          rewards: formData.rewards,
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
    const startTime = new Date(arena.startTime);
    const endTime = new Date(arena.endTime);
    
    // Ajustar para o fuso horário local
    const localStartTime = new Date(startTime.getTime() - startTime.getTimezoneOffset() * 60000);
    const localEndTime = new Date(endTime.getTime() - endTime.getTimezoneOffset() * 60000);

    setFormData({
      name: arena.name,
      description: arena.description || '',
      startTime: localStartTime.toISOString().slice(0, 16),
      endTime: localEndTime.toISOString().slice(0, 16),
      scoreMultiplier: arena.scoreMultiplier,
      bonusGems: arena.bonusGems,
      rewards: arena.config?.rewards || {
        top1: { credits: 0, gems: 0, cash: 0 },
        top3: { credits: 0, gems: 0, cash: 0 },
        top10: { credits: 0, gems: 0, cash: 0 },
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
      startTime: '',
      endTime: '',
      scoreMultiplier: 1.5,
      bonusGems: 50,
      rewards: {
        top1: { credits: 0, gems: 0, cash: 0 },
        top3: { credits: 0, gems: 0, cash: 0 },
        top10: { credits: 0, gems: 0, cash: 0 },
      },
    });
    setEditingArena(null);
  };

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
          <div className="flex gap-4">
            <button
              onClick={() => navigate('/admin/arena/schedules')}
              className="bg-indigo-600 hover:bg-indigo-700 px-6 py-3 rounded-lg font-bold transition-all"
            >
              ⏰ Horários Recorrentes
            </button>
            <button
              onClick={() => setShowLevelRangesModal(true)}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-bold transition-all"
            >
              ⚙️ Configurar Faixas de Nível
            </button>
            <button
              onClick={() => {
                resetForm();
                setShowArenaModal(true);
              }}
              className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-bold transition-all"
            >
              ➕ Nova Arena
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
              <h2 className="text-2xl font-bold">
                {editingArena ? '✏️ Editar Arena' : '➕ Nova Arena'}
              </h2>
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
                      placeholder="Ex: Arena de Desafios - Sábado"
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

              {/* Horários */}
              <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-bold mb-4 text-purple-400">⏰ Horários</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-2">Data/Hora de Início *</label>
                    <input
                      type="datetime-local"
                      required
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">Data/Hora de Término *</label>
                    <input
                      type="datetime-local"
                      required
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
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
                  <div>
                    <label className="block text-sm font-bold mb-2">Gemas Bônus</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.bonusGems}
                      onChange={(e) =>
                        setFormData({ ...formData, bonusGems: parseInt(e.target.value) })
                      }
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Premiações */}
              <div className="bg-gradient-to-br from-yellow-900/50 to-orange-900/50 rounded-lg p-6 border border-yellow-500/50">
                <h3 className="text-xl font-bold mb-6 text-yellow-300">🏆 Premiações</h3>
                <div className="space-y-4">
                  {(['top1', 'top3', 'top10'] as const).map((position) => (
                    <div
                      key={position}
                      className="bg-gray-800/50 rounded-lg p-4 border border-gray-700"
                    >
                      <h4 className="font-bold mb-3 text-yellow-400">
                        {position === 'top1' ? '🥇 1º Lugar' : position === 'top3' ? '🥈 Top 3' : '🥉 Top 10'}
                      </h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-bold mb-1">💎 Créditos</label>
                          <input
                            type="number"
                            min="0"
                            value={formData.rewards[position]?.credits || 0}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                rewards: {
                                  ...formData.rewards,
                                  [position]: {
                                    ...formData.rewards[position],
                                    credits: parseInt(e.target.value) || 0,
                                  },
                                },
                              })
                            }
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold mb-1">💎 Gemas</label>
                          <input
                            type="number"
                            min="0"
                            value={formData.rewards[position]?.gems || 0}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                rewards: {
                                  ...formData.rewards,
                                  [position]: {
                                    ...formData.rewards[position],
                                    gems: parseInt(e.target.value) || 0,
                                  },
                                },
                              })
                            }
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold mb-1">💵 Cash (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.rewards[position]?.cash || 0}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                rewards: {
                                  ...formData.rewards,
                                  [position]: {
                                    ...formData.rewards[position],
                                    cash: parseFloat(e.target.value) || 0,
                                  },
                                },
                              })
                            }
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
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
                  {loading ? 'Salvando...' : editingArena ? '💾 Atualizar Arena' : '✨ Criar Arena'}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {arenas.map((arena, index) => {
            const now = new Date();
            const startTime = new Date(arena.startTime);
            const endTime = new Date(arena.endTime);
            const isActive = startTime <= now && endTime > now;
            const isPast = endTime < now;
            const isFuture = startTime > now;

            return (
              <motion.div
                key={arena.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                whileHover={{ y: -8, scale: 1.02 }}
                className={`group relative bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl overflow-hidden shadow-2xl border-2 transition-all duration-300 ${
                  isActive
                    ? 'border-green-500/50 hover:border-green-400'
                    : isPast
                    ? 'border-gray-500/50 hover:border-gray-400'
                    : 'border-blue-500/50 hover:border-blue-400'
                }`}
              >
                {/* Badge de Status */}
                <div
                  className={`absolute top-3 right-3 z-10 px-3 py-1 rounded-full text-xs font-bold shadow-lg ${
                    isActive
                      ? 'bg-green-500 text-white'
                      : isPast
                      ? 'bg-gray-500 text-white'
                      : 'bg-blue-500 text-white'
                  }`}
                >
                  {isActive ? '✓ ATIVA' : isPast ? '✗ FINALIZADA' : '⏳ AGENDADA'}
                </div>

                {/* Conteúdo */}
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-white mb-2">{arena.name}</h3>
                  {arena.description && (
                    <p className="text-gray-400 text-sm mb-4">{arena.description}</p>
                  )}

                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">⏰ Início:</span>
                      <span className="text-white font-semibold">{formatDate(arena.startTime)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">⏰ Término:</span>
                      <span className="text-white font-semibold">{formatDate(arena.endTime)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">👥 Participantes:</span>
                      <span className="text-white font-semibold">{arena.participants}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">📊 Multiplicador:</span>
                      <span className="text-white font-semibold">x{arena.scoreMultiplier}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">💎 Gemas Bônus:</span>
                      <span className="text-white font-semibold">{arena.bonusGems}</span>
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
      )}

      {arenas.length === 0 && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border-2 border-slate-700"
        >
          <div className="text-8xl mb-6 animate-bounce">🏟️</div>
          <p className="text-3xl font-bold text-gray-300 mb-3">Nenhuma arena encontrada</p>
          <p className="text-gray-400 mb-6">Crie sua primeira arena clicando no botão "Nova Arena" acima</p>
          <button
            onClick={() => {
              resetForm();
              setShowArenaModal(true);
            }}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-lg transition-all"
          >
            ➕ Criar Primeira Arena
          </button>
        </motion.div>
      )}
    </div>
  );
}
