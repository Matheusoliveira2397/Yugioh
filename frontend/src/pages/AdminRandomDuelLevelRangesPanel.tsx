import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

interface LevelRange {
  id: number;
  minLevel: number;
  maxLevel: number;
  name: string;
  order: number;
  isActive: boolean;
  cashOnWin: number;
  cashOnLoss: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminRandomDuelLevelRangesPanel() {
  const navigate = useNavigate();
  const [ranges, setRanges] = useState<LevelRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRange, setEditingRange] = useState<LevelRange | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    minLevel: 1,
    maxLevel: 5,
    name: '',
    order: 0,
    isActive: true,
    cashOnWin: 0,
    cashOnLoss: 0,
  });

  useEffect(() => {
    loadRanges();
  }, []);

  const loadRanges = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/random-duel-level-ranges');
      setRanges(response.data);
    } catch (error) {
      console.error('Erro ao carregar faixas:', error);
      setMessage({ type: 'error', text: '❌ Erro ao carregar faixas de nível' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    // Validações
    if (formData.minLevel > formData.maxLevel) {
      setMessage({ type: 'error', text: '❌ O nível mínimo não pode ser maior que o máximo' });
      return;
    }

    if (!formData.name.trim()) {
      setMessage({ type: 'error', text: '❌ O nome da faixa é obrigatório' });
      return;
    }

    try {
      if (editingRange) {
        await api.put(`/admin/random-duel-level-ranges/${editingRange.id}`, formData);
        setMessage({ type: 'success', text: '✅ Faixa atualizada com sucesso!' });
      } else {
        await api.post('/admin/random-duel-level-ranges', formData);
        setMessage({ type: 'success', text: '✅ Faixa criada com sucesso!' });
      }

      await loadRanges();
      resetForm();
      setShowModal(false);
    } catch (error: any) {
      console.error('Erro ao salvar faixa:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || '❌ Erro ao salvar faixa',
      });
    }
  };

  const handleEdit = (range: LevelRange) => {
    setEditingRange(range);
    setFormData({
      minLevel: range.minLevel,
      maxLevel: range.maxLevel,
      name: range.name,
      order: range.order,
      isActive: range.isActive,
      cashOnWin: range.cashOnWin || 0,
      cashOnLoss: range.cashOnLoss || 0,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta faixa?')) {
      return;
    }

    try {
      await api.delete(`/admin/random-duel-level-ranges/${id}`);
      setMessage({ type: 'success', text: '✅ Faixa excluída com sucesso!' });
      await loadRanges();
    } catch (error: any) {
      console.error('Erro ao excluir faixa:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || '❌ Erro ao excluir faixa',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      minLevel: 1,
      maxLevel: 5,
      name: '',
      order: 0,
      isActive: true,
      cashOnWin: 0,
      cashOnLoss: 0,
    });
    setEditingRange(null);
  };

  const sortedRanges = [...ranges].sort((a, b) => a.order - b.order);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-900 to-orange-900 rounded-lg p-6 mb-8 shadow-2xl">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">🎲 Faixas de Nível - Random Duel</h1>
            <p className="text-gray-300">
              Configure quais faixas de nível podem se enfrentar no Random Duel
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => navigate('/admin')}
              className="bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-lg font-bold transition-all"
            >
              ← Voltar
            </button>
            <button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-bold transition-all"
            >
              ➕ Nova Faixa
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

      {/* Lista de Faixas */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-400">Carregando faixas...</p>
        </div>
      ) : sortedRanges.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700">
          <div className="text-4xl mb-4">📭</div>
          <p className="text-gray-400 mb-4">Nenhuma faixa configurada</p>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-bold transition-all"
          >
            ➕ Criar Primeira Faixa
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedRanges.map((range) => (
            <motion.div
              key={range.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-gradient-to-br ${
                range.isActive
                  ? 'from-red-800/50 to-orange-800/50 border-red-500/50'
                  : 'from-gray-800/50 to-gray-700/50 border-gray-600/50'
              } rounded-lg p-6 border-2 shadow-lg`}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold mb-1">{range.name}</h3>
                  <p className="text-gray-300 text-sm">
                    Nível {range.minLevel} - {range.maxLevel}
                  </p>
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    range.isActive
                      ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                      : 'bg-gray-500/20 text-gray-400 border border-gray-500/50'
                  }`}
                >
                  {range.isActive ? '✓ Ativa' : '✗ Inativa'}
                </div>
              </div>

              <div className="mb-4 space-y-2">
                <p className="text-gray-400 text-sm">Ordem: {range.order}</p>
                <div className="flex gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-green-400">💰 Vitória:</span>
                    <span className="font-bold text-green-300">{range.cashOnWin || 0} cash</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-red-400">💸 Derrota:</span>
                    <span className="font-bold text-red-300">{range.cashOnLoss || 0} cash</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(range)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold text-sm transition-all"
                >
                  ✏️ Editar
                </button>
                <button
                  onClick={() => handleDelete(range.id)}
                  className="flex-1 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-bold text-sm transition-all"
                >
                  🗑️ Excluir
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-red-500/50"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">
                {editingRange ? '✏️ Editar Faixa' : '➕ Nova Faixa'}
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
              <div>
                <label className="block text-sm font-bold mb-2">Nome da Faixa *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-red-500"
                  placeholder="Ex: Nível 1-5"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Nível Mínimo *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="100"
                    value={formData.minLevel}
                    onChange={(e) =>
                      setFormData({ ...formData, minLevel: parseInt(e.target.value) || 1 })
                    }
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Nível Máximo *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="100"
                    value={formData.maxLevel}
                    onChange={(e) =>
                      setFormData({ ...formData, maxLevel: parseInt(e.target.value) || 1 })
                    }
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Ordem</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.order}
                    onChange={(e) =>
                      setFormData({ ...formData, order: parseInt(e.target.value) || 0 })
                    }
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-red-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Usado para ordenar as faixas (menor = primeiro)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Status</label>
                  <select
                    value={formData.isActive ? 'true' : 'false'}
                    onChange={(e) =>
                      setFormData({ ...formData, isActive: e.target.value === 'true' })
                    }
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-red-500"
                  >
                    <option value="true">Ativa</option>
                    <option value="false">Inativa</option>
                  </select>
                </div>
              </div>

              {/* Premiações de Cash */}
              <div className="bg-gradient-to-br from-yellow-900/30 to-orange-900/30 rounded-lg p-4 border border-yellow-500/30">
                <h3 className="text-lg font-bold mb-4 text-yellow-300">💰 Premiações de Cash</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-2">
                      💚 Cash por Vitória
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.cashOnWin}
                      onChange={(e) =>
                        setFormData({ ...formData, cashOnWin: parseInt(e.target.value) || 0 })
                      }
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-yellow-500"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Cash ganho quando o duelista vence
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">
                      💔 Cash por Derrota
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.cashOnLoss}
                      onChange={(e) =>
                        setFormData({ ...formData, cashOnLoss: parseInt(e.target.value) || 0 })
                      }
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-yellow-500"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Cash ganho quando o duelista perde
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-4">
                <p className="text-yellow-300 text-sm">
                  <strong>ℹ️ Importante:</strong> Jogadores só podem se enfrentar se ambos estiverem
                  na mesma faixa de nível ativa. Certifique-se de que as faixas não se sobreponham
                  ou que haja faixas suficientes para cobrir todos os níveis.
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowModal(false);
                  }}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-lg font-bold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-bold transition-all"
                >
                  {editingRange ? '💾 Salvar Alterações' : '➕ Criar Faixa'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

