import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';

interface Season {
  id: string;
  name: string;
  seasonNumber: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  prizes?: {
    first: { trophy: string; credits: number };
    second: { trophy: string; credits: number };
    third: { trophy: string; credits: number };
  };
  divisionPrizes?: {
    [key: string]: {
      first: { trophy: string; credits: number };
      second: { trophy: string; credits: number };
      third: { trophy: string; credits: number };
    };
  };
  divisionPromotion?: {
    [key: string]: {
      promote: number;
      demote: number;
    };
  };
  createdAt: string;
  updatedAt: string;
}

const DIVISIONS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Legendary'];

export default function AdminSeasonsPanel() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    prizes: {
      first: { trophy: '🥇 Troféu Ouro', credits: 500 },
      second: { trophy: '🥈 Troféu Prata', credits: 250 },
      third: { trophy: '🥉 Troféu Bronze', credits: 100 },
    },
    divisionPrizes: {} as { [key: string]: { first: { trophy: string; credits: number }; second: { trophy: string; credits: number }; third: { trophy: string; credits: number } } },
    divisionPromotion: {} as { [key: string]: { promote: number; demote: number } },
  });

  useEffect(() => {
    loadSeasons();
  }, []);

  const loadSeasons = async () => {
    try {
      const response = await api.get('/seasons/admin/all');
      setSeasons(response.data);
    } catch (error) {
      console.error('Erro ao carregar seasons:', error);
      setMessage({ type: 'error', text: '❌ Erro ao carregar seasons' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const seasonData = {
        name: formData.name,
        startDate: new Date(formData.startDate).toISOString(),
        endDate: new Date(formData.endDate).toISOString(),
        prizes: formData.prizes,
        divisionPrizes: Object.keys(formData.divisionPrizes).length > 0 ? formData.divisionPrizes : undefined,
        divisionPromotion: Object.keys(formData.divisionPromotion).length > 0 ? formData.divisionPromotion : undefined,
      };

      if (editingSeason) {
        await api.put(`/seasons/admin/${editingSeason.id}`, seasonData);
        setMessage({ type: 'success', text: '✅ Season atualizada com sucesso!' });
      } else {
        await api.post('/seasons/admin/create', seasonData);
        setMessage({ type: 'success', text: '✅ Season criada com sucesso!' });
      }

      setShowModal(false);
      setEditingSeason(null);
      resetForm();
      loadSeasons();
    } catch (error: any) {
      console.error('Erro ao salvar season:', error);
      setMessage({ type: 'error', text: `❌ Erro: ${error.response?.data?.message || error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (season: Season) => {
    setEditingSeason(season);
    setFormData({
      name: season.name,
      startDate: new Date(season.startDate).toISOString().slice(0, 16),
      endDate: new Date(season.endDate).toISOString().slice(0, 16),
      prizes: season.prizes || {
        first: { trophy: '🥇 Troféu Ouro', credits: 500 },
        second: { trophy: '🥈 Troféu Prata', credits: 250 },
        third: { trophy: '🥉 Troféu Bronze', credits: 100 },
      },
      divisionPrizes: season.divisionPrizes || {},
      divisionPromotion: season.divisionPromotion || {},
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja deletar esta season?')) return;

    try {
      await api.delete(`/seasons/admin/${id}`);
      setMessage({ type: 'success', text: '✅ Season deletada com sucesso!' });
      loadSeasons();
    } catch (error: any) {
      console.error('Erro ao deletar season:', error);
      setMessage({ type: 'error', text: `❌ Erro: ${error.response?.data?.message || error.message}` });
    }
  };

  const handleEndSeason = async (id: string) => {
    if (!confirm('Tem certeza que deseja finalizar esta season? Os prêmios serão distribuídos automaticamente.')) return;

    try {
      await api.post(`/seasons/admin/${id}/end`);
      setMessage({ type: 'success', text: '✅ Season finalizada! Prêmios distribuídos.' });
      loadSeasons();
    } catch (error: any) {
      console.error('Erro ao finalizar season:', error);
      setMessage({ type: 'error', text: `❌ Erro: ${error.response?.data?.message || error.message}` });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      startDate: '',
      endDate: '',
      prizes: {
        first: { trophy: '🥇 Troféu Ouro', credits: 500 },
        second: { trophy: '🥈 Troféu Prata', credits: 250 },
        third: { trophy: '🥉 Troféu Bronze', credits: 100 },
      },
      divisionPrizes: {},
      divisionPromotion: {},
    });
  };

  const updateDivisionPrize = (division: string, position: 'first' | 'second' | 'third', field: 'trophy' | 'credits', value: string | number) => {
    setFormData(prev => ({
      ...prev,
      divisionPrizes: {
        ...prev.divisionPrizes,
        [division]: {
          ...prev.divisionPrizes[division],
          [position]: {
            ...prev.divisionPrizes[division]?.[position],
            [field]: value,
          },
        },
      },
    }));
  };

  const updateDivisionPromotion = (division: string, field: 'promote' | 'demote', value: number) => {
    setFormData(prev => ({
      ...prev,
      divisionPromotion: {
        ...prev.divisionPromotion,
        [division]: {
          ...prev.divisionPromotion[division],
          [field]: value,
        },
      },
    }));
  };

  if (loading && seasons.length === 0) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-white text-xl">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 relative z-10">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-5xl font-bold text-white mb-2 flex items-center gap-3">
            <span className="text-6xl">🏆</span>
            Gerenciar Seasons
          </h1>
          <p className="text-slate-400 text-lg">Configure temporadas, prêmios e divisões</p>
        </motion.div>

        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-4 p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}
          >
            {message.text}
          </motion.div>
        )}

        <div className="mb-6">
          <button
            onClick={() => {
              resetForm();
              setEditingSeason(null);
              setShowModal(true);
            }}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all"
          >
            + Nova Season
          </button>
        </div>

        <div className="grid gap-4">
          {seasons.map((season) => (
            <motion.div
              key={season.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800/50 rounded-xl p-6 border border-slate-700"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-2xl font-bold text-white">{season.name}</h3>
                    {season.isActive && (
                      <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg text-sm font-bold">
                        ATIVA
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 mb-4">
                    {new Date(season.startDate).toLocaleDateString()} - {new Date(season.endDate).toLocaleDateString()}
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-400">Prêmio 1º:</span>
                      <span className="text-white ml-2">{season.prizes?.first.trophy} + {season.prizes?.first.credits} créditos</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Prêmio 2º:</span>
                      <span className="text-white ml-2">{season.prizes?.second.trophy} + {season.prizes?.second.credits} créditos</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Prêmio 3º:</span>
                      <span className="text-white ml-2">{season.prizes?.third.trophy} + {season.prizes?.third.credits} créditos</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Prêmios por Divisão:</span>
                      <span className="text-white ml-2">
                        {season.divisionPrizes ? Object.keys(season.divisionPrizes).length : 0} divisões configuradas
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {season.isActive && (
                    <button
                      onClick={() => handleEndSeason(season.id)}
                      className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg"
                    >
                      Finalizar
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(season)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  >
                    Editar
                  </button>
                  {!season.isActive && (
                    <button
                      onClick={() => handleDelete(season.id)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
                    >
                      Deletar
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-slate-800 rounded-xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-3xl font-bold text-white mb-6">
                {editingSeason ? 'Editar Season' : 'Nova Season'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-slate-300 mb-2">Nome da Season</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 mb-2">Data de Início</label>
                    <input
                      type="datetime-local"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-2">Data de Término</label>
                    <input
                      type="datetime-local"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div className="border-t border-slate-700 pt-6">
                  <h3 className="text-xl font-bold text-white mb-4">Prêmios Gerais (Top 3)</h3>
                  {(['first', 'second', 'third'] as const).map((position) => (
                    <div key={position} className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-slate-300 mb-2">{position === 'first' ? '1º Lugar' : position === 'second' ? '2º Lugar' : '3º Lugar'} - Troféu</label>
                        <input
                          type="text"
                          value={formData.prizes[position].trophy}
                          onChange={(e) => setFormData({
                            ...formData,
                            prizes: { ...formData.prizes, [position]: { ...formData.prizes[position], trophy: e.target.value } }
                          })}
                          className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-300 mb-2">Créditos</label>
                        <input
                          type="number"
                          value={formData.prizes[position].credits}
                          onChange={(e) => setFormData({
                            ...formData,
                            prizes: { ...formData.prizes, [position]: { ...formData.prizes[position], credits: parseInt(e.target.value) || 0 } }
                          })}
                          className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-700 pt-6">
                  <h3 className="text-xl font-bold text-white mb-4">Prêmios por Divisão (Top 3 de cada)</h3>
                  {DIVISIONS.map((division) => (
                    <div key={division} className="mb-6 p-4 bg-slate-700/50 rounded-lg">
                      <h4 className="text-lg font-bold text-white mb-3">{division}</h4>
                      {(['first', 'second', 'third'] as const).map((position) => (
                        <div key={position} className="grid grid-cols-2 gap-4 mb-3">
                          <div>
                            <label className="block text-slate-300 mb-1 text-sm">{position === 'first' ? '1º' : position === 'second' ? '2º' : '3º'} - Troféu</label>
                            <input
                              type="text"
                              value={formData.divisionPrizes[division]?.[position]?.trophy || ''}
                              onChange={(e) => updateDivisionPrize(division, position, 'trophy', e.target.value)}
                              className="w-full px-3 py-2 bg-slate-600 text-white rounded-lg text-sm"
                              placeholder={`Ex: 🥇 ${division}`}
                            />
                          </div>
                          <div>
                            <label className="block text-slate-300 mb-1 text-sm">Créditos</label>
                            <input
                              type="number"
                              value={formData.divisionPrizes[division]?.[position]?.credits || 0}
                              onChange={(e) => updateDivisionPrize(division, position, 'credits', parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-2 bg-slate-600 text-white rounded-lg text-sm"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-700 pt-6">
                  <h3 className="text-xl font-bold text-white mb-2">📊 Configuração de Promoção/Rebaixamento</h3>
                  <p className="text-slate-400 text-sm mb-4">
                    Configure quantos jogadores sobem e descem de cada divisão ao final da season.
                    Os jogadores são ordenados por score da season dentro de cada divisão.
                  </p>
                  {DIVISIONS.map((division, index) => {
                    const isLowest = index === DIVISIONS.length - 1; // Bronze é a menor
                    const isHighest = index === 0; // Legendary é a maior
                    
                    return (
                      <div key={division} className="mb-4 p-4 bg-slate-700/50 rounded-lg">
                        <h4 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                          {division}
                          {isHighest && <span className="text-xs text-yellow-400">(Divisão Máxima)</span>}
                          {isLowest && <span className="text-xs text-orange-400">(Divisão Mínima)</span>}
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-slate-300 mb-1 text-sm">
                              ⬆️ Quantos sobem {!isHighest && `(para ${DIVISIONS[index - 1]})`}
                              {isHighest && <span className="text-slate-500"> (Não aplicável)</span>}
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={formData.divisionPromotion[division]?.promote || 0}
                              onChange={(e) => updateDivisionPromotion(division, 'promote', parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-2 bg-slate-600 text-white rounded-lg text-sm"
                              disabled={isHighest}
                              placeholder="Ex: 10"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                              Top {formData.divisionPromotion[division]?.promote || 0} jogadores sobem
                            </p>
                          </div>
                          <div>
                            <label className="block text-slate-300 mb-1 text-sm">
                              ⬇️ Quantos descem {!isLowest && `(para ${DIVISIONS[index + 1]})`}
                              {isLowest && <span className="text-slate-500"> (Não aplicável)</span>}
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={formData.divisionPromotion[division]?.demote || 0}
                              onChange={(e) => updateDivisionPromotion(division, 'demote', parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-2 bg-slate-600 text-white rounded-lg text-sm"
                              disabled={isLowest}
                              placeholder="Ex: 5"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                              Últimos {formData.divisionPromotion[division]?.demote || 0} jogadores descem
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Salvando...' : editingSeason ? 'Atualizar' : 'Criar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingSeason(null);
                      resetForm();
                    }}
                    className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
