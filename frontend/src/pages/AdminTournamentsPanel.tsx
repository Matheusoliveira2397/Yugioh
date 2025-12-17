import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';
import CardImage from '../components/CardImage';

interface Tournament {
  id: string;
  name: string;
  description?: string;
  format: string;
  maxParticipants: number;
  currentParticipants: number;
  status: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  startAt: string;
  prizeFirst: number;
  prizeSecond: number;
  prizeThird: number;
  entryFee: number;
  banlist?: string[];
  createdAt: string;
  updatedAt: string;
}

interface Card {
  id: string;
  idCarta: string;
  name: string;
  type: string;
  cardImage?: string;
}

export default function AdminTournamentsPanel() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [banlistSearch, setBanlistSearch] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    format: 'single_elimination',
    maxParticipants: 16,
    registrationOpenAt: '',
    registrationCloseAt: '',
    startAt: '',
    prizeFirst: 0,
    prizeSecond: 0,
    prizeThird: 0,
    entryFee: 0,
    banlist: [] as string[],
  });

  useEffect(() => {
    loadTournaments();
    loadAllCards();
  }, []);

  useEffect(() => {
    if (message?.type === 'error') {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const loadTournaments = async () => {
    try {
      const response = await api.get('/tournaments');
      setTournaments(response.data);
    } catch (error) {
      console.error('Erro ao carregar torneios:', error);
      setMessage({ type: 'error', text: 'Erro ao carregar torneios' });
    } finally {
      setLoading(false);
    }
  };

  const loadAllCards = async () => {
    try {
      const response = await api.get('/cards/admin/all');
      setAllCards(response.data.filter((card: Card) => card.isActive));
    } catch (error) {
      console.error('Erro ao carregar cartas:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (!formData.name.trim()) {
      setMessage({ type: 'error', text: 'Nome do torneio é obrigatório' });
      setLoading(false);
      return;
    }

    if (!formData.registrationOpenAt || !formData.registrationCloseAt || !formData.startAt) {
      setMessage({ type: 'error', text: 'Todos os horários são obrigatórios' });
      setLoading(false);
      return;
    }

    if (new Date(formData.registrationOpenAt) >= new Date(formData.registrationCloseAt)) {
      setMessage({ type: 'error', text: 'Horário de fechamento deve ser após o de abertura' });
      setLoading(false);
      return;
    }

    if (new Date(formData.registrationCloseAt) >= new Date(formData.startAt)) {
      setMessage({ type: 'error', text: 'Horário de início deve ser após o fechamento de inscrições' });
      setLoading(false);
      return;
    }

    if (formData.maxParticipants < 2 || formData.maxParticipants > 128) {
      setMessage({ type: 'error', text: 'Número de participantes deve estar entre 2 e 128' });
      setLoading(false);
      return;
    }

    try {
      const tournamentData = {
        ...formData,
        registrationOpenAt: new Date(formData.registrationOpenAt).toISOString(),
        registrationCloseAt: new Date(formData.registrationCloseAt).toISOString(),
        startAt: new Date(formData.startAt).toISOString(),
        banlist: formData.banlist.length > 0 ? formData.banlist : null,
      };

      if (editingTournament) {
        await api.put(`/tournaments/${editingTournament.id}`, tournamentData);
        setMessage({ type: 'success', text: 'Torneio atualizado com sucesso!' });
      } else {
        await api.post('/tournaments', tournamentData);
        setMessage({ type: 'success', text: 'Torneio criado com sucesso!' });
      }

      setShowForm(false);
      setEditingTournament(null);
      resetForm();
      loadTournaments();
    } catch (error: any) {
      console.error('Erro ao salvar torneio:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Erro ao salvar torneio',
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      format: 'single_elimination',
      maxParticipants: 16,
      registrationOpenAt: '',
      registrationCloseAt: '',
      startAt: '',
      prizeFirst: 0,
      prizeSecond: 0,
      prizeThird: 0,
      entryFee: 0,
      banlist: [],
    });
  };

  const handleEdit = (tournament: Tournament) => {
    setEditingTournament(tournament);
    setFormData({
      name: tournament.name,
      description: tournament.description || '',
      format: tournament.format,
      maxParticipants: tournament.maxParticipants,
      registrationOpenAt: new Date(tournament.registrationOpenAt).toISOString().slice(0, 16),
      registrationCloseAt: new Date(tournament.registrationCloseAt).toISOString().slice(0, 16),
      startAt: new Date(tournament.startAt).toISOString().slice(0, 16),
      prizeFirst: tournament.prizeFirst,
      prizeSecond: tournament.prizeSecond,
      prizeThird: tournament.prizeThird,
      entryFee: tournament.entryFee,
      banlist: tournament.banlist || [],
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este torneio?')) return;

    try {
      await api.delete(`/tournaments/${id}`);
      setMessage({ type: 'success', text: 'Torneio excluído com sucesso!' });
      loadTournaments();
    } catch (error) {
      console.error('Erro ao excluir torneio:', error);
      setMessage({ type: 'error', text: 'Erro ao excluir torneio' });
    }
  };

  const addToBanlist = (cardId: string) => {
    if (!formData.banlist.includes(cardId)) {
      setFormData({ ...formData, banlist: [...formData.banlist, cardId] });
    }
  };

  const removeFromBanlist = (cardId: string) => {
    setFormData({ ...formData, banlist: formData.banlist.filter(id => id !== cardId) });
  };

  const filteredCards = allCards.filter(card =>
    card.name.toLowerCase().includes(banlistSearch.toLowerCase()) ||
    card.idCarta?.toLowerCase().includes(banlistSearch.toLowerCase())
  );

  const filteredTournaments = tournaments.filter(tournament =>
    tournament.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-gray-500';
      case 'registration_open': return 'bg-green-500';
      case 'registration_closed': return 'bg-yellow-500';
      case 'in_progress': return 'bg-blue-500';
      case 'finished': return 'bg-purple-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  if (loading && tournaments.length === 0) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-white text-xl">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Gerenciar Torneios</h1>
            <p className="text-gray-400">Criar e gerenciar torneios do jogo</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setEditingTournament(null);
              setShowForm(true);
            }}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-800 text-white font-bold rounded-lg hover:from-purple-700 hover:to-purple-900 transition-all"
          >
            + Criar Torneio
          </button>
        </div>

        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-4 p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-500/20 border border-green-500' : 'bg-red-500/20 border border-red-500'
            }`}
          >
            <p className={message.type === 'success' ? 'text-green-400' : 'text-red-400'}>
              {message.text}
            </p>
          </motion.div>
        )}

        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-slate-800 rounded-xl p-6 mb-8 border-2 border-purple-500"
          >
            <h2 className="text-2xl font-bold text-white mb-6">
              {editingTournament ? 'Editar Torneio' : 'Criar Novo Torneio'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white mb-2">Nome do Torneio *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                    required
                  />
                </div>

                <div>
                  <label className="block text-white mb-2">Formato</label>
                  <select
                    value={formData.format}
                    onChange={(e) => setFormData({ ...formData, format: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                  >
                    <option value="single_elimination">Mata-Mata</option>
                    <option value="double_elimination">Dupla Eliminação</option>
                    <option value="swiss">Sistema Suíço</option>
                    <option value="round_robin">Todos contra Todos</option>
                  </select>
                </div>

                <div>
                  <label className="block text-white mb-2">Máximo de Participantes *</label>
                  <input
                    type="number"
                    min="2"
                    max="128"
                    value={formData.maxParticipants}
                    onChange={(e) => setFormData({ ...formData, maxParticipants: parseInt(e.target.value) || 16 })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                    required
                  />
                </div>

                <div>
                  <label className="block text-white mb-2">Taxa de Inscrição (Créditos)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.entryFee}
                    onChange={(e) => setFormData({ ...formData, entryFee: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-white mb-2">Abertura de Inscrições *</label>
                  <input
                    type="datetime-local"
                    value={formData.registrationOpenAt}
                    onChange={(e) => setFormData({ ...formData, registrationOpenAt: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                    required
                  />
                </div>

                <div>
                  <label className="block text-white mb-2">Fechamento de Inscrições *</label>
                  <input
                    type="datetime-local"
                    value={formData.registrationCloseAt}
                    onChange={(e) => setFormData({ ...formData, registrationCloseAt: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                    required
                  />
                </div>

                <div>
                  <label className="block text-white mb-2">Início do Torneio *</label>
                  <input
                    type="datetime-local"
                    value={formData.startAt}
                    onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-white mb-2">Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-white mb-2">Prêmio 1º Lugar (Créditos)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.prizeFirst}
                    onChange={(e) => setFormData({ ...formData, prizeFirst: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-white mb-2">Prêmio 2º Lugar (Créditos)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.prizeSecond}
                    onChange={(e) => setFormData({ ...formData, prizeSecond: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-white mb-2">Prêmio 3º Lugar (Créditos)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.prizeThird}
                    onChange={(e) => setFormData({ ...formData, prizeThird: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                  />
                </div>
              </div>

              {/* Banlist */}
              <div className="border-t border-slate-700 pt-4">
                <h3 className="text-xl font-bold text-white mb-4">Banlist</h3>
                
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Buscar carta para banir..."
                    value={banlistSearch}
                    onChange={(e) => setBanlistSearch(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                  />
                </div>

                {banlistSearch && (
                  <div className="max-h-60 overflow-y-auto bg-slate-900 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {filteredCards.slice(0, 20).map((card) => (
                        <div
                          key={card.id}
                          onClick={() => addToBanlist(card.idCarta || card.id)}
                          className={`cursor-pointer p-2 rounded-lg border-2 ${
                            formData.banlist.includes(card.idCarta || card.id)
                              ? 'border-red-500 bg-red-500/20'
                              : 'border-slate-700 hover:border-purple-500'
                          }`}
                        >
                          <CardImage
                            card={card}
                            className="w-full aspect-[2/3] object-cover rounded"
                            fallback="/images/fundoCarta.webp"
                          />
                          <p className="text-xs text-white mt-2 truncate">{card.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {formData.banlist.length > 0 && (
                  <div>
                    <p className="text-white mb-2">Cartas Banidas ({formData.banlist.length}):</p>
                    <div className="flex flex-wrap gap-2">
                      {formData.banlist.map((cardId) => {
                        const card = allCards.find(c => (c.idCarta || c.id) === cardId);
                        return (
                          <div
                            key={cardId}
                            className="flex items-center gap-2 bg-red-500/20 border border-red-500 rounded-lg p-2"
                          >
                            {card && (
                              <>
                                <CardImage
                                  card={card}
                                  className="w-12 h-16 object-cover rounded"
                                  fallback="/images/fundoCarta.webp"
                                />
                                <span className="text-white text-sm">{card.name}</span>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => removeFromBanlist(cardId)}
                              className="text-red-400 hover:text-red-300"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-800 text-white font-bold rounded-lg hover:from-purple-700 hover:to-purple-900 transition-all disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : editingTournament ? 'Atualizar' : 'Criar Torneio'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingTournament(null);
                    resetForm();
                  }}
                  className="px-6 py-3 bg-slate-700 text-white font-bold rounded-lg hover:bg-slate-600 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        )}

        <div className="mb-4">
          <input
            type="text"
            placeholder="Buscar torneios..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 bg-slate-800 text-white rounded-lg"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTournaments.map((tournament) => (
            <motion.div
              key={tournament.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800 rounded-xl p-6 border-2 border-purple-500"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-white">{tournament.name}</h3>
                <span className={`px-2 py-1 rounded text-xs text-white ${getStatusColor(tournament.status)}`}>
                  {tournament.status}
                </span>
              </div>

              <div className="space-y-2 text-gray-300 mb-4 text-sm">
                <p>👥 {tournament.currentParticipants}/{tournament.maxParticipants} participantes</p>
                <p>📅 Início: {new Date(tournament.startAt).toLocaleString('pt-BR')}</p>
                <p>💰 Taxa: {tournament.entryFee} créditos</p>
                {tournament.banlist && tournament.banlist.length > 0 && (
                  <p>🚫 {tournament.banlist.length} cartas banidas</p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(tournament)}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(tournament.id)}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

