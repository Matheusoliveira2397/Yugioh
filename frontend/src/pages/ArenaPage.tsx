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
  groupLogo?: string;
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
  const [isCreatingDuel, setIsCreatingDuel] = useState(false);
  const [userArenaPoints, setUserArenaPoints] = useState<number>(0);
  const [remainingDuels, setRemainingDuels] = useState<number>(50);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [levelRanges, setLevelRanges] = useState<Array<{ min: number; max: number; name: string }>>([]);

  useEffect(() => {
    fetchArenas();
    fetchLevelRanges();
  }, []);

  const fetchLevelRanges = async () => {
    try {
      // Tentar endpoint público primeiro
      const response = await axios.get(`${API_URL}/arena/config/level-ranges`);
      if (response.data && Array.isArray(response.data)) {
        setLevelRanges(response.data);
        return;
      }
    } catch (error) {
      // Se falhar, tentar com autenticação
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const response = await axios.get(`${API_URL}/arena/admin/config/level-ranges`, { headers });
        if (response.data && Array.isArray(response.data)) {
          setLevelRanges(response.data);
          return;
        }
      } catch (adminError) {
        console.error('Erro ao buscar faixas de nível:', adminError);
      }
    }
    
    // Fallback para faixas padrão se não conseguir buscar
    setLevelRanges([
      { min: 1, max: 1, name: 'Nível 1' },
      { min: 2, max: 3, name: 'Nível 2-3' },
      { min: 4, max: 5, name: 'Nível 4-5' },
      { min: 6, max: 10, name: 'Nível 6-10' },
      { min: 11, max: 999, name: 'Nível 11+' },
    ]);
  };

  useEffect(() => {
    if (currentArena?.id) {
      fetchArenaRankings(currentArena.id);
      fetchUserArenaStats(currentArena.id);
      
      // Calcular tempo restante
      const interval = setInterval(() => {
        if (currentArena) {
          const now = new Date().getTime();
          const endTime = new Date(currentArena.endTime).getTime();
          const remaining = Math.max(0, endTime - now);
          setTimeRemaining(remaining);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [currentArena]);

  useEffect(() => {
    if (user?.level) {
      setDivision(getLevelDivision(user.level));
    }

    const socket = getSocket();
    if (!socket) return;

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

    const duelFoundListener = (data: any) => {
      console.log('✅ [ArenaPage] Match encontrado na arena:', data);
      
      if (data?.duelId) {
        console.log('✅ [ArenaPage] Duelo já foi criado automaticamente');
        setIsSearchingArena(false);
        return;
      }
      
      if (data?.player1Id && data?.player2Id && !isCreatingDuel) {
        console.log('📤 [ArenaPage] Criando duelo da arena...');
        setIsCreatingDuel(true);
        setIsSearchingArena(false);
        
        const payload = {
          player1Id: Number(data.player1Id),
          player2Id: Number(data.player2Id),
          origin: 'ARENA'
        };
        
        const duelCreatedHandler = (duelData: any) => {
          console.log('✅ [ArenaPage] Duelo criado:', duelData);
          setIsCreatingDuel(false);
          socket.off('duelCreated', duelCreatedHandler);
        };
        
        socket.on('duelCreated', duelCreatedHandler);
        
        socket.emit('createDuelFromMatch', payload, (response: any) => {
          console.log('📥 [ArenaPage] Resposta do servidor:', response);
        });
        
        setTimeout(() => {
          socket.off('duelCreated', duelCreatedHandler);
          setIsCreatingDuel(false);
        }, 10000);
      }
    };

    socket.on('searchingArenaDuel', searchingListener);
    socket.on('searchCancelled', cancelledListener);
    socket.on('duelError', errorListener);
    socket.on('duelFound', duelFoundListener);

    return () => {
      socket.off('searchingArenaDuel', searchingListener);
      socket.off('searchCancelled', cancelledListener);
      socket.off('duelError', errorListener);
      socket.off('duelFound', duelFoundListener);
    };
  }, [user, getSocket, isCreatingDuel]);

  const fetchArenas = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const currentRes = await axios.get(`${API_URL}/arena/current`, { headers });
      if (currentRes.data.arena) {
        setCurrentArena(currentRes.data.arena);
      }

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

  const fetchUserArenaStats = async (arenaId: string) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API_URL}/arena/ranking/${arenaId}`, { headers });
      
      // Encontrar o usuário atual nos rankings
      if (user?.id && response.data) {
        for (const [division, rankings] of Object.entries(response.data)) {
          const userRanking = (rankings as ArenaRanking[]).find(r => r.userId === Number(user.id));
          if (userRanking) {
            setUserArenaPoints(userRanking.score || 0);
            // Calcular duelos restantes (assumindo limite de 50 duelos por arena)
            const totalDuels = userRanking.wins + userRanking.losses;
            setRemainingDuels(Math.max(0, 50 - totalDuels));
            break;
          }
        }
      }
    } catch (error) {
      console.error('Erro ao buscar stats do usuário:', error);
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

  const formatTimeRemaining = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const getDivisionIcon = (division: string): string => {
    if (division.includes('Nível 2') || division.includes('Nível 3')) return '🥈';
    if (division.includes('Nível 4') || division.includes('Nível 5')) return '🥇';
    if (division.includes('Nível 6') || division.includes('Nível 10')) return '🥇';
    if (division.includes('Nível 11')) return '🥇';
    return '🥉';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-2xl">⏳ Carregando arenas...</div>
      </div>
    );
  }

  // Obter rankings ordenados pelas faixas configuradas
  const sortedRankings = levelRanges.map(range => ({
    name: range.name,
    rankings: arenaRankings[range.name] || []
  }));

  return (
    <div className="max-w-7xl mx-auto pl-2 sm:pl-4 pr-2 sm:pr-4 py-4 sm:py-6 -ml-2 sm:ml-0">
      {currentArena && inArena ? (
        <>
          {/* Banner Superior */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-3 sm:p-6 mb-4 sm:mb-6 border border-amber-400/30"
          >
            <div className="flex items-center justify-between text-white gap-2 sm:gap-4">
              {/* Arena Points */}
              <div className="text-center flex-1">
                <div className="text-xs sm:text-sm font-semibold mb-1">Arena Points</div>
                <div className="text-2xl sm:text-4xl font-bold">{userArenaPoints}</div>
              </div>

              {/* Timer Central */}
              <div className="text-center flex-1">
                <div className="text-xl sm:text-3xl md:text-5xl font-bold mb-1">{formatTimeRemaining(timeRemaining)}</div>
                <div className="text-xs sm:text-sm font-semibold">para finalizar</div>
              </div>

              {/* Duelos Restantes */}
              <div className="text-center flex-1">
                <div className="text-xs sm:text-sm font-semibold mb-1">Duelos Restantes</div>
                <div className="text-2xl sm:text-4xl font-bold">{remainingDuels}</div>
              </div>
            </div>
          </motion.div>

          {/* Botão Procurar Duelo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-8"
          >
            {isCreatingDuel ? (
              <div className="rounded-xl p-8 border-2 border-blue-500 text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-16 h-16 border-8 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"
                />
                <h3 className="text-2xl font-bold text-blue-400 mb-2">Criando Duelo...</h3>
                <p className="text-gray-300">Aguarde enquanto o duelo é criado...</p>
              </div>
            ) : duelFound ? (
              <div className="rounded-xl p-8 border-2 border-green-500 text-center">
                <h3 className="text-2xl font-bold text-green-400 mb-4">⚔️ Duelo Encontrado!</h3>
                <p className="text-gray-300 mb-2">
                  Oponente: <span className="font-bold text-red-400">
                    {duelFound.opponent?.clanTag ? `|${duelFound.opponent.clanTag}| ` : ''}
                    {duelFound.opponent?.username || 'Oponente'}
                  </span>
                </p>
                {duelFound.duelId ? (
                  <button 
                    onClick={() => window.open(`/duel/${duelFound.duelId}`, '_blank')}
                    className="mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-lg text-xl transition-all"
                  >
                    ⚔️ Entrar no Duelo
                  </button>
                ) : (
                  <p className="text-yellow-400">Aguardando criação do duelo...</p>
                )}
              </div>
            ) : isSearchingArena ? (
              <div className="rounded-xl p-8 border-2 border-red-500 text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-16 h-16 border-8 border-red-500 border-t-transparent rounded-full mx-auto mb-4"
                />
                <h3 className="text-2xl font-bold text-red-400 mb-2">Procurando Oponente...</h3>
                <p className="text-gray-300 mb-1">Divisão: <span className="font-bold text-purple-400">{division}</span></p>
                {queueSize > 0 && (
                  <p className="text-gray-400 text-sm mb-4">
                    {queueSize} jogador(es) na sua divisão procurando duelo
                  </p>
                )}
                <button 
                  onClick={handleCancelArenaSearch}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-all"
                >
                  Cancelar Busca
                </button>
              </div>
            ) : (
              <button
                onClick={handleSearchArenaDuel}
                disabled={!isConnected}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-4 sm:py-6 md:py-8 rounded-xl text-xl sm:text-2xl md:text-3xl transition-all shadow-2xl hover:shadow-green-500/50 disabled:cursor-not-allowed flex items-center justify-center gap-2 sm:gap-4"
              >
                <span className="text-3xl sm:text-4xl md:text-5xl">⚔️</span>
                <span>Procurar Duelo</span>
                <span className="text-3xl sm:text-4xl md:text-5xl">⚔️</span>
              </button>
            )}
          </motion.div>

          {/* Painéis de Ranking - Lado a lado dinamicamente */}
          <div className={`grid grid-cols-1 ${sortedRankings.length === 2 ? 'md:grid-cols-2' : sortedRankings.length === 3 ? 'md:grid-cols-2 lg:grid-cols-3' : sortedRankings.length >= 4 ? 'md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2'} gap-3 sm:gap-4 md:gap-6`}>
            {sortedRankings.map((divisionData, index) => (
              <motion.div
                key={divisionData.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="rounded-xl p-3 sm:p-4 md:p-6 border-2 border-white/20 hover:border-purple-500/50 transition-all duration-300"
              >
                <h3 className="text-lg sm:text-xl md:text-2xl font-bold mb-3 sm:mb-4 text-center text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-blue-300">{divisionData.name}</h3>
                
                {loadingRankings ? (
                  <div className="text-center py-8 text-gray-400">Carregando...</div>
                ) : divisionData.rankings.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">Nenhum duelista nesta divisão ainda</div>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
                    {divisionData.rankings.map((player) => (
                      <div
                        key={player.userId}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 transition-colors border border-white/10"
                      >
                        <div className="text-lg font-bold text-white w-8">
                          {player.rank}°
                        </div>
                        <img
                          src={`${API_URL}${player.profileImage}?t=${Date.now()}`}
                          alt={player.nickname}
                          className="w-12 h-12 rounded-full border-2 border-slate-500 object-cover"
                          onError={(e) => {
                            e.currentTarget.src = '/images/default.png';
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white truncate flex items-center gap-2">
                            {player.groupLogo && (
                              <img 
                                src={`${API_URL}${player.groupLogo}`}
                                alt={player.nickname}
                                className="w-5 h-5 rounded object-cover flex-shrink-0"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            )}
                            <span>{player.clanTag ? `|${player.clanTag}| ${player.nickname}` : player.nickname}</span>
                          </div>
                          <div className="text-sm text-gray-300">
                            AP: {player.score} | DR: {player.wins}
                          </div>
                        </div>
                        <div className="text-2xl">
                          {getDivisionIcon(divisionData.name)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </>
      ) : currentArena ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl p-12 text-center"
        >
          <div className="text-6xl mb-4">⚔️</div>
          <h2 className="text-3xl font-bold mb-4">{currentArena.name}</h2>
          <p className="text-xl text-gray-400 mb-6">{currentArena.description}</p>
          <button
            onClick={() => handleJoinArena(currentArena.id)}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-6 px-12 rounded-lg text-2xl transition-all shadow-lg hover:shadow-red-500/50"
          >
            🔥 ENTRAR NA ARENA AGORA! 🔥
          </button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl p-12 text-center"
        >
          <div className="text-6xl mb-4">⏰</div>
          <h2 className="text-3xl font-bold mb-2">Nenhuma Arena Ativa</h2>
          <p className="text-xl text-gray-400">
            As arenas aparecem em horários específicos. Aguarde a próxima!
          </p>
        </motion.div>
      )}
    </div>
  );
}
