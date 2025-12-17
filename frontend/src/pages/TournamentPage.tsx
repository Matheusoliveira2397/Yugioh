import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuthStore } from '../stores/authStore';
import TournamentBracket from '../components/TournamentBracket';

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
  creator?: {
    id: number;
    nickname: string;
  };
}

interface Top3Player {
  position: number;
  user: {
    id: number;
    nickname: string;
    profileImage: string;
  };
  prize: number;
}

interface Match {
  id: string;
  round: number;
  matchNumber: number;
  player1Id?: number;
  player2Id?: number;
  winnerId?: number;
  status: string;
  player1?: {
    id: number;
    nickname: string;
    profileImage?: string;
  };
  player2?: {
    id: number;
    nickname: string;
    profileImage?: string;
  };
  winner?: {
    id: number;
    nickname: string;
  };
  scheduledAt: string;
  startedAt?: string;
  finishedAt?: string;
}

interface Bracket {
  tournament: {
    id: string;
    name: string;
    status: string;
    currentRound: number;
    maxParticipants: number;
    currentParticipants: number;
  };
  rounds: { [round: number]: Match[] };
  totalRounds: number;
}

export default function TournamentPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [top3, setTop3] = useState<Top3Player[]>([]);
  const [loadingTop3, setLoadingTop3] = useState(false);
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [loadingBracket, setLoadingBracket] = useState(false);
  const [showBracket, setShowBracket] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  useEffect(() => {
    loadTournaments();
  }, []);

  const loadTournaments = async () => {
    try {
      const response = await api.get('/tournaments');
      setTournaments(response.data);
    } catch (error) {
      console.error('Erro ao carregar torneios:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTop3 = async (tournamentId: string) => {
    if (selectedTournament?.status !== 'finished') return;
    
    setLoadingTop3(true);
    try {
      const response = await api.get(`/tournaments/${tournamentId}/top3`);
      setTop3(response.data);
    } catch (error) {
      console.error('Erro ao carregar top 3:', error);
      setTop3([]);
    } finally {
      setLoadingTop3(false);
    }
  };

  const handleRegister = async (tournamentId: string) => {
    if (!user) {
      navigate('/login');
      return;
    }

    try {
      await api.post(`/tournaments/${tournamentId}/register`);
      alert('Inscrição realizada com sucesso!');
      await loadTournaments();
      // Atualizar torneio selecionado se for o mesmo
      if (selectedTournament?.id === tournamentId) {
        const updated = tournaments.find(t => t.id === tournamentId);
        if (updated) {
          setSelectedTournament(updated);
        }
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao se inscrever no torneio');
    }
  };

  const loadBracket = async (tournamentId: string) => {
    setLoadingBracket(true);
    try {
      const response = await api.get(`/tournaments/${tournamentId}/bracket`);
      setBracket(response.data);
    } catch (error) {
      console.error('Erro ao carregar bracket:', error);
      setBracket(null);
    } finally {
      setLoadingBracket(false);
    }
  };

  const handleViewDetails = async (tournament: Tournament) => {
    setSelectedTournament(tournament);
    setShowBracket(false); // Reset bracket visibility
    if (tournament.status === 'finished') {
      await loadTop3(tournament.id);
    } else if (tournament.status === 'in_progress' || tournament.status === 'registration_closed' || tournament.status === 'finished') {
      // Carregar bracket mas não mostrar automaticamente
      await loadBracket(tournament.id);
    }
  };

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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'scheduled': return 'Agendado';
      case 'registration_open': return 'Inscrições Abertas';
      case 'registration_closed': return 'Inscrições Fechadas';
      case 'in_progress': return 'Em Andamento';
      case 'finished': return 'Finalizado';
      case 'cancelled': return 'Cancelado';
      default: return status;
    }
  };

  const getFormatLabel = (format: string) => {
    switch (format) {
      case 'single_elimination': return 'Mata-Mata';
      case 'double_elimination': return 'Dupla Eliminação';
      case 'swiss': return 'Sistema Suíço';
      case 'round_robin': return 'Todos contra Todos';
      default: return format;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-white text-xl">Carregando torneios...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">Torneios</h1>

        {selectedTournament && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-6 mb-8 border-2 border-purple-500"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-3xl font-bold text-white mb-2">{selectedTournament.name}</h2>
                <p className="text-gray-400">{selectedTournament.description || 'Sem descrição'}</p>
              </div>
              <button
                onClick={() => setSelectedTournament(null)}
                className="text-white hover:text-red-400 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="rounded-lg p-4 border border-white/20">
                <p className="text-gray-400 text-sm">Formato</p>
                <p className="text-white font-bold">{getFormatLabel(selectedTournament.format)}</p>
              </div>
              <div className="rounded-lg p-4 border border-white/20">
                <p className="text-gray-400 text-sm">Status</p>
                <span className={`inline-block px-3 py-1 rounded text-sm text-white ${getStatusColor(selectedTournament.status)}`}>
                  {getStatusLabel(selectedTournament.status)}
                </span>
              </div>
              <div className="rounded-lg p-4 border border-white/20">
                <p className="text-gray-400 text-sm">Participantes</p>
                <p className="text-white font-bold">{selectedTournament.currentParticipants}/{selectedTournament.maxParticipants}</p>
              </div>
              <div className="rounded-lg p-4 border border-white/20">
                <p className="text-gray-400 text-sm">Taxa de Inscrição</p>
                <p className="text-white font-bold">{selectedTournament.entryFee} créditos</p>
              </div>
              <div className="rounded-lg p-4 border border-white/20">
                <p className="text-gray-400 text-sm">Início</p>
                <p className="text-white font-bold">{new Date(selectedTournament.startAt).toLocaleString('pt-BR')}</p>
              </div>
              {selectedTournament.banlist && selectedTournament.banlist.length > 0 && (
                <div className="rounded-lg p-4 border border-white/20">
                  <p className="text-gray-400 text-sm">Banlist</p>
                  <p className="text-white font-bold">{selectedTournament.banlist.length} cartas banidas</p>
                </div>
              )}
            </div>

            {/* Bracket */}
            {(selectedTournament.status === 'in_progress' || selectedTournament.status === 'registration_closed' || selectedTournament.status === 'finished') && (
              <div className="border-t border-slate-700 pt-6 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-2xl font-bold text-white">🏆 Chave do Torneio</h3>
                  <button
                    onClick={() => {
                      if (!showBracket && !bracket) {
                        loadBracket(selectedTournament.id);
                      }
                      setShowBracket(!showBracket);
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all flex items-center gap-2"
                  >
                    {showBracket ? '👁️ Ocultar' : '🔍 Ver Chave'}
                  </button>
                </div>
                
                {showBracket && (
                  <>
                    {loadingBracket ? (
                      <div className="text-white text-center py-8">Carregando chave...</div>
                    ) : bracket && bracket.totalRounds > 0 ? (
                      <div className="relative">
                        <TournamentBracket bracket={bracket} />
                      </div>
                    ) : (
                      <p className="text-gray-400 text-center py-8">
                        {selectedTournament.status === 'registration_closed' 
                          ? 'Chave será gerada em breve...' 
                          : 'Chave ainda não foi gerada'}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Top 3 */}
            {selectedTournament.status === 'finished' && (
              <div className="border-t border-slate-700 pt-6">
                <h3 className="text-2xl font-bold text-white mb-4">🏆 Top 3</h3>
                {loadingTop3 ? (
                  <div className="text-white">Carregando...</div>
                ) : top3.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {top3.map((player) => (
                      <motion.div
                        key={player.position}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`bg-gradient-to-br ${
                          player.position === 1
                            ? 'from-yellow-600 to-yellow-800'
                            : player.position === 2
                            ? 'from-gray-400 to-gray-600'
                            : 'from-orange-600 to-orange-800'
                        } rounded-xl p-6 text-center`}
                      >
                        <div className="text-6xl mb-4">
                          {player.position === 1 ? '🥇' : player.position === 2 ? '🥈' : '🥉'}
                        </div>
                        <div className="w-20 h-20 mx-auto mb-4 rounded-full overflow-hidden border-4 border-white">
                          <img
                            src={player.user.profileImage || '/images/default.png'}
                            alt={player.user.nickname}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = '/images/default.png';
                            }}
                          />
                        </div>
                        <h4 className="text-xl font-bold text-white mb-2">{player.user.nickname}</h4>
                        <p className="text-white/80 text-sm">💰 {player.prize} créditos</p>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400">Top 3 não disponível</p>
                )}
              </div>
            )}

            {selectedTournament.status === 'registration_open' && (
              <button
                onClick={() => handleRegister(selectedTournament.id)}
                className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-green-800 text-white font-bold rounded-lg hover:from-green-700 hover:to-green-900 transition-all"
              >
                Inscrever-se
              </button>
            )}
          </motion.div>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((tournament) => (
            <motion.div
              key={tournament.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.05 }}
              className="bg-slate-800 rounded-lg p-6 border-2 border-purple-500 cursor-pointer"
              onClick={() => handleViewDetails(tournament)}
            >
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold text-white">{tournament.name}</h2>
                <span className={`px-2 py-1 rounded text-xs text-white ${getStatusColor(tournament.status)}`}>
                  {getStatusLabel(tournament.status)}
                </span>
              </div>
              <div className="space-y-2 text-gray-300 mb-6 text-sm">
                <p>📅 Início: {new Date(tournament.startAt).toLocaleString('pt-BR')}</p>
                <p>👥 Participantes: {tournament.currentParticipants}/{tournament.maxParticipants}</p>
                <p>🏆 1º Lugar: {tournament.prizeFirst} créditos</p>
                {tournament.entryFee > 0 && (
                  <p>💰 Taxa: {tournament.entryFee} créditos</p>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewDetails(tournament);
                }}
                className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-800 text-white font-bold rounded-lg hover:from-purple-700 hover:to-purple-900 transition-all"
              >
                Ver Detalhes
              </button>
            </motion.div>
          ))}
        </div>

        {tournaments.length === 0 && (
          <div className="text-center text-gray-400 py-12">
            <p className="text-xl">Nenhum torneio disponível no momento</p>
          </div>
        )}
      </div>
    </div>
  );
}
