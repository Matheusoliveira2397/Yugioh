import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { useSocket } from '../hooks/useSocket';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Função para determinar divisão baseada no nível
const getLevelDivision = (level: number): string => {
  if (level <= 1) return 'Nível 1';
  if (level <= 3) return 'Nível 2-3';
  if (level <= 5) return 'Nível 4-5';
  if (level <= 10) return 'Nível 6-10';
  return 'Nível 11+';
};

interface Arena {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  startTime: string;
  endTime: string;
  participants: number;
  scoreMultiplier: number;
  bonusGems: number;
}

interface ArenaRanking {
  rank: number;
  userId: number;
  nickname: string;
  clanTag?: string;
  profileImage: string;
  level: number;
  wins: number;
  losses: number;
  score: number;
}

export default function ArenaPage() {
  const { token, user } = useAuthStore();
  const { isConnected, duelFound, cancelSearch, getSocket } = useSocket();
  const [currentArena, setCurrentArena] = useState<Arena | null>(null);
  const [upcomingArenas, setUpcomingArenas] = useState<Arena[]>([]);
  const [loading, setLoading] = useState(true);
  const [inArena, setInArena] = useState(false);
  const [arenaRankings, setArenaRankings] = useState<Record<string, ArenaRanking[]>>({});
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [isSearchingArena, setIsSearchingArena] = useState(false);
  const [division, setDivision] = useState<string>('');
  const [queueSize, setQueueSize] = useState<number>(0);

  useEffect(() => {
    fetchArenas();
  }, []);

  useEffect(() => {
    if (currentArena?.id) {
      fetchArenaRankings(currentArena.id);
    }
  }, [currentArena]);

  useEffect(() => {
    if (user?.level) {
      setDivision(getLevelDivision(user.level));
    }

    const socket = getSocket();
    if (!socket) return;

    // Listener para busca de duelo na arena
    const searchingListener = (data: any) => {
      setIsSearchingArena(true);
      setQueueSize(data.queueSize || 0);
      if (data.division) {
        setDivision(data.division);
      }
    };

    const cancelledListener = () => {
      setIsSearchingArena(false);
      setQueueSize(0);
    };

    const errorListener = (data: any) => {
      alert(data.message || 'Erro ao buscar duelo');
      setIsSearchingArena(false);
    };

    socket.on('searchingArenaDuel', searchingListener);
    socket.on('searchCancelled', cancelledListener);
    socket.on('duelError', errorListener);

    return () => {
      socket.off('searchingArenaDuel', searchingListener);
      socket.off('searchCancelled', cancelledListener);
      socket.off('duelError', errorListener);
    };
  }, [user, getSocket]);

  const fetchArenas = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      // Buscar arena atual
      const currentRes = await axios.get(`${API_URL}/arena/current`, { headers });
      if (currentRes.data.arena) {
        setCurrentArena(currentRes.data.arena);
      }

      // Buscar próximas arenas
      const upcomingRes = await axios.get(`${API_URL}/arena/upcoming`, { headers });
      if (upcomingRes.data.arenas) {
        setUpcomingArenas(upcomingRes.data.arenas);
      }
    } catch (error) {
      console.error('Erro ao buscar arenas:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchArenaRankings = async (arenaId: string) => {
    try {
      setLoadingRankings(true);
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API_URL}/arena/ranking/${arenaId}`, { headers });
      setArenaRankings(response.data);
    } catch (error) {
      console.error('Erro ao buscar rankings da arena:', error);
    } finally {
      setLoadingRankings(false);
    }
  };

  const handleJoinArena = async (arenaId: string) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`${API_URL}/arena/join/${arenaId}`, {}, { headers });
      setInArena(true);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao entrar na arena');
    }
  };

  const handleSearchArenaDuel = () => {
    if (!user?.id) return;
    
    const socket = getSocket();
    if (!socket) return;
    
    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
    socket.emit('searchArenaDuel', { userId });
    setIsSearchingArena(true);
  };

  const handleCancelArenaSearch = () => {
    if (!user?.id) return;
    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
    
    const socket = getSocket();
    if (socket) {
      socket.emit('cancelSearch', { userId });
    }
    
    cancelSearch(userId);
    setIsSearchingArena(false);
    setQueueSize(0);
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-2xl">⏳ Carregando arenas...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 bg-clip-text text-transparent">
          ⚔️ Arena de Desafios
        </h1>
        <p className="text-xl text-gray-400">
          Entre em arenas especiais com multiplicadores de pontos e recompensas exclusivas!
        </p>
      </motion.div>

      {/* Arena Atual */}
      {currentArena ? (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-gradient-to-r from-red-900 to-orange-900 rounded-xl p-8 mb-8 shadow-2xl border-4 border-red-500"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="px-4 py-1 bg-red-600 rounded-full text-sm font-bold animate-pulse">
                  🔴 AO VIVO
                </span>
                <span className="text-gray-300">
                  {formatTime(currentArena.startTime)} - {formatTime(currentArena.endTime)}
                </span>
              </div>
              <h2 className="text-4xl font-bold mb-2">{currentArena.name}</h2>
              <p className="text-xl text-gray-300">{currentArena.description}</p>
            </div>
            <div className="text-center">
              <div className="text-gray-400 text-sm">Participantes</div>
              <div className="text-5xl font-bold">{currentArena.participants}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-black/40 rounded-lg p-4 text-center">
              <div className="text-3xl mb-2">⚡</div>
              <div className="text-yellow-400 font-bold text-2xl">{currentArena.scoreMultiplier}x</div>
              <div className="text-sm text-gray-400">Multiplicador de Pontos</div>
            </div>
            <div className="bg-black/40 rounded-lg p-4 text-center">
              <div className="text-3xl mb-2">💎</div>
              <div className="text-blue-400 font-bold text-2xl">{currentArena.bonusGems}</div>
              <div className="text-sm text-gray-400">Gemas Bônus</div>
            </div>
            <div className="bg-black/40 rounded-lg p-4 text-center">
              <div className="text-3xl mb-2">🏆</div>
              <div className="text-green-400 font-bold text-2xl">+50%</div>
              <div className="text-sm text-gray-400">Rating Extra</div>
            </div>
            <div className="bg-black/40 rounded-lg p-4 text-center">
              <div className="text-3xl mb-2">🎁</div>
              <div className="text-purple-400 font-bold text-2xl">2x</div>
              <div className="text-sm text-gray-400">Recompensas</div>
            </div>
          </div>

          {!inArena ? (
            <button
              onClick={() => handleJoinArena(currentArena.id)}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-6 rounded-lg text-2xl transition-all shadow-lg hover:shadow-red-500/50"
            >
              🔥 ENTRAR NA ARENA AGORA! 🔥
            </button>
          ) : (
            <div className="space-y-4">
              {duelFound ? (
                <div className="bg-green-900/50 rounded-lg p-6 border-2 border-green-500">
                  <h3 className="text-2xl font-bold text-green-400 mb-4">⚔️ Duelo Encontrado!</h3>
                  <p className="text-gray-300 mb-2">
                    Oponente: <span className="font-bold text-red-400">
                      {duelFound.opponent.clanTag ? `|${duelFound.opponent.clanTag}| ` : ''}
                      {duelFound.opponent.username}
                    </span>
                  </p>
                  <p className="text-gray-400 mb-4">Divisão: {division}</p>
                  <button 
                    onClick={() => window.open(`/duel/${duelFound.duelId}`, '_blank')}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg text-xl transition-all"
                  >
                    ⚔️ Entrar no Duelo
                  </button>
                </div>
              ) : isSearchingArena ? (
                <div className="bg-red-900/50 rounded-lg p-6 border-2 border-red-500">
                  <div className="flex items-center justify-center mb-4">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      className="w-16 h-16 border-8 border-red-500 border-t-transparent rounded-full"
                    />
                  </div>
                  <h3 className="text-2xl font-bold text-red-400 mb-2">Procurando Oponente...</h3>
                  <p className="text-gray-300 mb-1">Divisão: <span className="font-bold text-purple-400">{division}</span></p>
                  {queueSize > 0 && (
                    <p className="text-gray-400 text-sm mb-4">
                      {queueSize} jogador(es) na sua divisão procurando duelo
                    </p>
                  )}
                  <button 
                    onClick={handleCancelArenaSearch}
                    className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 rounded-lg transition-all"
                  >
                    Cancelar Busca
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-green-600/20 rounded-lg p-4 border border-green-500 text-center">
                    <p className="text-green-400 font-bold text-lg mb-2">✅ Você está na Arena!</p>
                    <p className="text-gray-300 text-sm">Sua Divisão: <span className="font-bold text-purple-400">{division}</span></p>
                  </div>
                  <button
                    onClick={handleSearchArenaDuel}
                    disabled={!isConnected}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-bold py-6 rounded-lg text-2xl transition-all shadow-lg hover:shadow-red-500/50 disabled:cursor-not-allowed"
                  >
                    ⚔️ Procurar Duelo na Arena
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-gray-800 rounded-xl p-12 mb-8 text-center"
        >
          <div className="text-6xl mb-4">⏰</div>
          <h2 className="text-3xl font-bold mb-2">Nenhuma Arena Ativa</h2>
          <p className="text-xl text-gray-400">
            As arenas aparecem em horários específicos. Aguarde a próxima!
          </p>
        </motion.div>
      )}

      {/* Rankings por Divisão */}
      {currentArena && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h2 className="text-4xl font-bold mb-6">🏆 Rankings por Divisão</h2>
          
          {loadingRankings ? (
            <div className="text-center py-8">
              <div className="text-2xl">⏳ Carregando rankings...</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {Object.entries(arenaRankings).map(([division, rankings]) => (
                <motion.div
                  key={division}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-gray-800 rounded-xl p-6 border-2 border-purple-500/30"
                >
                  <h3 className="text-2xl font-bold mb-4 text-purple-400">{division}</h3>
                  
                  {rankings.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      Nenhum duelista nesta divisão ainda
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rankings.map((player) => (
                        <div
                          key={player.userId}
                          className={`flex items-center gap-3 p-3 rounded-lg ${
                            player.rank === 1
                              ? 'bg-gradient-to-r from-yellow-600 to-amber-600'
                              : player.rank === 2
                              ? 'bg-gradient-to-r from-gray-400 to-gray-600'
                              : player.rank === 3
                              ? 'bg-gradient-to-r from-orange-600 to-orange-800'
                              : 'bg-gray-700/50'
                          }`}
                        >
                          <div className="text-2xl font-bold w-8">
                            {player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : player.rank === 3 ? '🥉' : `#${player.rank}`}
                          </div>
                          <img
                            src={`${API_URL}${player.profileImage}`}
                            alt={player.nickname}
                            className="w-10 h-10 rounded-full border-2 border-white/50"
                            onError={(e) => {
                              e.currentTarget.src = '/images/default.png';
                            }}
                          />
                          <div className="flex-1">
                            <div className="font-bold text-white">
                              {player.clanTag ? `|${player.clanTag}| ${player.nickname}` : player.nickname}
                            </div>
                            <div className="text-sm text-gray-200">
                              {player.wins}V - {player.losses}D | Score: {player.score}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Próximas Arenas */}
      <div>
        <h2 className="text-3xl font-bold mb-6">📅 Próximas Arenas</h2>
        
        {upcomingArenas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {upcomingArenas.map((arena, index) => (
              <motion.div
                key={arena.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-gray-800 rounded-xl p-6 border-2 border-gray-700 hover:border-orange-500 transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-2xl font-bold">{arena.name}</h3>
                  <span className="px-3 py-1 bg-orange-600 rounded-full text-sm font-bold">
                    {formatDate(arena.startTime)}
                  </span>
                </div>

                <p className="text-gray-400 mb-4">{arena.description}</p>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-gray-900 rounded-lg p-3 text-center">
                    <div className="text-yellow-400 font-bold">{arena.scoreMultiplier}x</div>
                    <div className="text-xs text-gray-500">Pontos</div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3 text-center">
                    <div className="text-blue-400 font-bold">💎 {arena.bonusGems}</div>
                    <div className="text-xs text-gray-500">Gemas</div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3 text-center">
                    <div className="text-green-400 font-bold">
                      {formatTime(arena.startTime)}
                    </div>
                    <div className="text-xs text-gray-500">Início</div>
                  </div>
                </div>

                <div className="text-center text-sm text-gray-500">
                  Duração: {formatTime(arena.startTime)} - {formatTime(arena.endTime)}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl p-8 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-400">Nenhuma arena agendada no momento</p>
          </div>
        )}
      </div>

      {/* Informações */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-8 bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-xl p-6 border border-purple-500/30"
      >
        <h3 className="text-2xl font-bold mb-4">ℹ️ Como Funcionam as Arenas?</h3>
        <ul className="space-y-2 text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-yellow-500">⚡</span>
            <span><strong>Multiplicadores:</strong> Ganhe mais pontos por vitória durante o evento</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500">💎</span>
            <span><strong>Recompensas:</strong> Gemas bônus e itens exclusivos ao vencer</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500">🏆</span>
            <span><strong>Rating:</strong> Aumente seu ranking mais rapidamente</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-500">⏱️</span>
            <span><strong>Tempo Limitado:</strong> As arenas duram apenas 2 horas!</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-500">📊</span>
            <span><strong>Divisões por Nível:</strong> Você só enfrenta duelistas do mesmo nível na arena!</span>
          </li>
        </ul>
      </motion.div>
    </div>
  );
}
