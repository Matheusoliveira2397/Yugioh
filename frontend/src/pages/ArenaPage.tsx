import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { useSocket } from '../hooks/useSocket';
import axios from 'axios';
import { getImageUrl } from '../utils/imageUrl';

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
  config?: {
    levelRanges?: Array<{ min: number; max: number; name: string }>;
  };
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
  remainingDuels?: number;
  groupLogo?: string;
}

export default function ArenaPage() {
  const { token, user } = useAuthStore();
  const { isConnected, duelFound, clearDuelFound, cancelSearch, getSocket } = useSocket();
  const [currentArena, setCurrentArena] = useState<Arena | null>(null);
  const [upcomingArenas, setUpcomingArenas] = useState<Arena[]>([]);
  const [loading, setLoading] = useState(true);
  const [inArena, setInArena] = useState(false);
  const [arenaRankings, setArenaRankings] = useState<Record<string, ArenaRanking[]>>({});
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [isSearchingArena, setIsSearchingArena] = useState(false);
  const [division, setDivision] = useState<string>('');
  const [queueSize, setQueueSize] = useState<number>(0);
  const [arenaLevelRange, setArenaLevelRange] = useState<string>('');
  const [isCreatingDuel, setIsCreatingDuel] = useState(false);
  const [userArenaPoints, setUserArenaPoints] = useState<number>(0);
  const [remainingDuels, setRemainingDuels] = useState<number>(50);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [timeUntilNextArena, setTimeUntilNextArena] = useState<number>(0);
  const [nextArena, setNextArena] = useState<Arena | null>(null);
  const [levelRanges, setLevelRanges] = useState<Array<{ min: number; max: number; name: string }>>([]);

  useEffect(() => {
    fetchArenas();
    fetchLevelRanges();
    // Limpar match anterior ao abrir a página (ex.: voltou de um duelo) para poder procurar de novo (até 50 duelos por arena)
    clearDuelFound();
    // Atualizar a cada 30s para pegar a arena quando abrir no horário (criada pelo cron)
    const interval = setInterval(fetchArenas, 30000);
    return () => clearInterval(interval);
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

  // Calcular tempo até a próxima arena
  useEffect(() => {
    // Determinar qual é a próxima arena
    let next: Arena | null = null;
    
    if (currentArena) {
      // Se há arena atual, procurar a próxima após ela terminar
      const currentEndTime = new Date(currentArena.endTime).getTime();
      const now = new Date().getTime();
      
      // Se a arena atual ainda não terminou, a próxima é a primeira das upcoming
      if (now < currentEndTime) {
        next = upcomingArenas.length > 0 ? upcomingArenas[0] : null;
      } else {
        // Se a arena atual terminou, a próxima é a primeira das upcoming
        next = upcomingArenas.length > 0 ? upcomingArenas[0] : null;
      }
    } else {
      // Se não há arena atual, a próxima é a primeira das upcoming
      next = upcomingArenas.length > 0 ? upcomingArenas[0] : null;
    }
    
    setNextArena(next);
    
    // Atualizar contador a cada segundo
    const interval = setInterval(() => {
      if (next) {
        const now = new Date().getTime();
        const startTime = new Date(next.startTime).getTime();
        const remaining = Math.max(0, startTime - now);
        setTimeUntilNextArena(remaining);
      } else {
        setTimeUntilNextArena(0);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentArena, upcomingArenas]);

  useEffect(() => {
    if (user?.level) {
      setDivision(getLevelDivision(user.level));
    }

    const socket = getSocket();
    if (!socket) return;

    const searchingListener = (data: any) => {
      setIsSearchingArena(true);
      setQueueSize(data.queueSize || 0);
      setArenaLevelRange(data.levelRange || '');
      if (data.division) {
        setDivision(data.division);
      }
    };

    const cancelledListener = () => {
      setIsSearchingArena(false);
      setQueueSize(0);
      setArenaLevelRange('');
    };

    const errorListener = (data: any) => {
      alert(data.message || 'Erro ao buscar duelo');
      setIsSearchingArena(false);
    };

    const duelFoundListener = (data: any) => {
      console.log('✅ [ArenaPage] Match/duelo encontrado na arena:', data);
      if (data?.duelId) {
        setIsSearchingArena(false);
        setIsCreatingDuel(false);
      }
    };

    const duelCreatedListener = () => {
      setIsSearchingArena(false);
      setIsCreatingDuel(false);
    };

    socket.on('searchingArenaDuel', searchingListener);
    socket.on('searchCancelled', cancelledListener);
    socket.on('duelError', errorListener);
    socket.on('duelFound', duelFoundListener);
    socket.on('duelCreated', duelCreatedListener);

    return () => {
      socket.off('searchingArenaDuel', searchingListener);
      socket.off('searchCancelled', cancelledListener);
      socket.off('duelError', errorListener);
      socket.off('duelFound', duelFoundListener);
      socket.off('duelCreated', duelCreatedListener);
    };
  }, [user, getSocket]);

  const ARENA_ENTERED_KEY = (arenaId: string) => `arena_entered_${arenaId}`;

  const fetchArenas = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      // Arena atual = instância da arena criada pelo admin em "Criar Arena"
      const currentRes = await axios.get(`${API_URL}/arena/current`, { headers });
      if (currentRes.data.arena) {
        const arena = currentRes.data.arena;
        setCurrentArena(arena);
        // Se o usuário já entrou nesta arena (ex.: antes de recarregar ou voltar de um duelo), manter "dentro da arena"
        if (typeof localStorage !== 'undefined' && localStorage.getItem(ARENA_ENTERED_KEY(arena.id)) === '1') {
          setInArena(true);
        }
      } else {
        setCurrentArena(null);
      }

      // Próxima arena (sempre buscar para mostrar contador: "próxima em X")
      const nextRes = await axios.get(`${API_URL}/arena/next`, { headers });
      if (nextRes.data?.arena) {
        setUpcomingArenas([nextRes.data.arena]);
        const startTime = new Date(nextRes.data.arena.startTime).getTime();
        setTimeUntilNextArena(Math.max(0, startTime - Date.now()));
      } else {
        setUpcomingArenas([]);
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
            setRemainingDuels(userRanking.remainingDuels ?? Math.max(0, 50 - totalDuels));
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
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ARENA_ENTERED_KEY(arenaId), '1');
      }
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
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-lg text-gray-400">⏳ Carregando arenas...</div>
      </div>
    );
  }

  // Dentro da arena: só as faixas de nível ativas (configuradas na arena); senão usa a lista global
  const activeLevelRanges =
    currentArena?.config?.levelRanges?.length
      ? currentArena.config.levelRanges
      : levelRanges;
  const sortedRankings = activeLevelRanges.map(range => ({
    name: range.name,
    rankings: arenaRankings[range.name] || []
  }));

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-5">
      {currentArena && inArena ? (
        <>
          {/* Banner Superior */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg p-3 sm:p-4 mb-3 sm:mb-4 border border-amber-400/30"
          >
            <div className="flex items-center justify-between text-white gap-2 sm:gap-3">
              <div className="text-center flex-1">
                <div className="text-xs font-semibold mb-0.5">Arena Points</div>
                <div className="text-xl sm:text-2xl font-bold">{userArenaPoints}</div>
              </div>
              <div className="text-center flex-1">
                <div className="text-lg sm:text-xl md:text-2xl font-bold mb-0.5">{formatTimeRemaining(timeRemaining)}</div>
                <div className="text-xs font-semibold">para finalizar</div>
              </div>
              <div className="text-center flex-1">
                <div className="text-xs font-semibold mb-0.5">Duelos Restantes</div>
                <div className="text-xl sm:text-2xl font-bold">{remainingDuels}</div>
              </div>
            </div>
          </motion.div>

          {nextArena && timeUntilNextArena > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg p-3 mb-3 sm:mb-4 bg-gradient-to-r from-blue-900/50 to-indigo-900/50 border border-blue-500/50"
            >
              <div className="text-center text-white">
                <div className="text-xs font-semibold text-gray-300 mb-1">
                  Próxima arena: <span className="font-bold text-blue-400">{nextArena.name}</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                  {formatTimeRemaining(timeUntilNextArena)}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Início: {new Date(nextArena.startTime).toLocaleString('pt-BR')}
                </div>
              </div>
            </motion.div>
          )}

          {/* Botão Procurar Duelo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-5 sm:mb-6"
          >
            {isCreatingDuel ? (
              <div className="rounded-lg p-5 sm:p-6 border-2 border-blue-500 text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"
                />
                <h3 className="text-lg font-bold text-blue-400 mb-1">Criando Duelo...</h3>
                <p className="text-sm text-gray-300">Aguarde enquanto o duelo é criado...</p>
              </div>
            ) : duelFound ? (
              <div className="rounded-lg p-5 sm:p-6 border-2 border-green-500 text-center">
                <h3 className="text-lg font-bold text-green-400 mb-2">⚔️ Duelo Encontrado!</h3>
                <p className="text-sm text-gray-300 mb-2">
                  Oponente: <span className="font-bold text-red-400">
                    {duelFound.opponent?.clanTag ? `|${duelFound.opponent.clanTag}| ` : ''}
                    {duelFound.opponent?.username || 'Oponente'}
                  </span>
                </p>
                {duelFound.duelId ? (
                  <button 
                    onClick={() => {
                      window.open(`/duel/${duelFound.duelId}`, '_blank');
                      setTimeout(() => clearDuelFound(), 1500);
                    }}
                    className="mt-3 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-6 rounded-lg text-base transition-all"
                  >
                    ⚔️ Entrar no Duelo
                  </button>
                ) : (
                  <p className="text-sm text-yellow-400">Aguardando criação do duelo...</p>
                )}
              </div>
            ) : isSearchingArena ? (
              <div className="rounded-lg p-5 sm:p-6 border-2 border-red-500 text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full mx-auto mb-3"
                />
                <h3 className="text-lg font-bold text-red-400 mb-1">Procurando Oponente...</h3>
                <p className="text-sm text-gray-300 mb-0.5">
                  Faixa: <span className="font-bold text-purple-400">{arenaLevelRange || division}</span>
                </p>
                <p className="text-xs text-gray-400 mb-2">Duelo apenas com jogadores da mesma faixa.</p>
                {queueSize > 0 && (
                  <p className="text-xs text-gray-400 mb-3">
                    {queueSize} jogador(es) na sua faixa
                  </p>
                )}
                <button 
                  onClick={handleCancelArenaSearch}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-all"
                >
                  Cancelar Busca
                </button>
              </div>
            ) : (
              <button
                onClick={handleSearchArenaDuel}
                disabled={!isConnected}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-3 sm:py-4 rounded-xl text-lg sm:text-xl transition-all shadow-lg hover:shadow-green-500/50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span className="text-2xl">⚔️</span>
                <span>Procurar Duelo</span>
                <span className="text-2xl">⚔️</span>
              </button>
            )}
          </motion.div>

          {/* Painéis de Ranking */}
          <div className={`grid grid-cols-1 ${sortedRankings.length === 2 ? 'md:grid-cols-2' : sortedRankings.length === 3 ? 'md:grid-cols-2 lg:grid-cols-3' : sortedRankings.length >= 4 ? 'md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2'} gap-3`}>
            {sortedRankings.map((divisionData, index) => (
              <motion.div
                key={divisionData.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="rounded-lg p-3 sm:p-4 border-2 border-white/20 hover:border-purple-500/50 transition-all duration-300"
              >
                <h3 className="text-base sm:text-lg font-bold mb-2 sm:mb-3 text-center text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-blue-300">{divisionData.name}</h3>
                
                {loadingRankings ? (
                  <div className="text-center py-6 text-gray-400 text-sm">Carregando...</div>
                ) : divisionData.rankings.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 text-sm">Nenhum duelista nesta divisão ainda</div>
                ) : (
                  <div className="space-y-1.5 max-h-[380px] overflow-y-auto custom-scrollbar">
                    {divisionData.rankings.map((player) => {
                      const dr = player.remainingDuels ?? Math.max(0, 50 - (player.wins + player.losses));
                      const rankBg = player.rank === 1 ? 'bg-amber-500/30 border-amber-400' : player.rank === 2 ? 'bg-slate-400/30 border-slate-300' : player.rank === 3 ? 'bg-amber-700/30 border-amber-600' : 'border-white/10';
                      return (
                        <div
                          key={player.userId}
                          className={`flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 transition-colors border ${rankBg}`}
                        >
                          <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            player.rank === 1 ? 'bg-amber-500 text-black' : player.rank === 2 ? 'bg-slate-300 text-slate-800' : player.rank === 3 ? 'bg-amber-600 text-white' : 'bg-white/20 text-white'
                          }`}>
                            {player.rank}°
                          </div>
                          <img
                            src={getImageUrl(player.profileImage) + (player.profileImage ? `?t=${Date.now()}` : '')}
                            alt={player.nickname}
                            className="w-9 h-9 rounded-full border-2 border-slate-500 object-cover flex-shrink-0"
                            onError={(e) => {
                              e.currentTarget.src = '/images/default.png';
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-white text-sm truncate">
                              {player.clanTag ? `[${player.clanTag}] ${player.nickname}` : player.nickname}
                            </div>
                            <div className="text-xs text-gray-300 flex items-center gap-2">
                              <span><strong className="text-amber-400">AP:</strong> {player.score}</span>
                              <span><strong className="text-blue-300">DR:</strong> {dr}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
          className="rounded-lg p-4 sm:p-6 text-center"
        >
          <div className="mb-3 inline-block px-3 py-1.5 bg-green-600/20 border-2 border-green-500 rounded-full">
            <span className="text-green-400 font-bold text-xs">✓ ARENA ATIVA</span>
          </div>
          
          <h2 className="text-xl sm:text-2xl font-bold mb-3">{currentArena.name}</h2>
          <p className="text-sm sm:text-base text-gray-400 mb-4">{currentArena.description}</p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-center">
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400 mb-0.5">⏰ Início</div>
              <div className="text-xs font-bold text-white">
                {new Date(currentArena.startTime).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400 mb-0.5">⏰ Término</div>
              <div className="text-xs font-bold text-white">
                {new Date(currentArena.endTime).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400 mb-0.5">👥 Participantes</div>
              <div className="text-xs font-bold text-white">{currentArena.participants}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400 mb-0.5">📊 Multiplicador</div>
              <div className="text-xs font-bold text-white">x{currentArena.scoreMultiplier}</div>
            </div>
          </div>
          
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="cursor-pointer mb-4 relative group"
            onClick={() => handleJoinArena(currentArena.id)}
          >
            <div className="relative rounded-lg overflow-hidden border-2 border-red-500/50 group-hover:border-red-500 transition-all shadow-lg">
              <img
                src="/images/ArenaDeDuelos.jpg"
                alt="Arena de Duelos"
                className="w-full h-auto max-h-[340px] object-contain"
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  if (target.src.includes('ArenaDeDuelos.jpg')) {
                    target.src = '/images/CampoDeDuelo01.jpg';
                  } else {
                    target.src = '/images/background.webp';
                  }
                }}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center pointer-events-none">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-600/90 text-white font-bold py-2.5 px-6 rounded-lg text-base">
                  🔥 CLIQUE PARA ENTRAR! 🔥
                </div>
              </div>
            </div>
          </motion.div>
          
          <button
            onClick={() => handleJoinArena(currentArena.id)}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 sm:py-4 px-6 sm:px-8 rounded-lg text-base sm:text-lg transition-all shadow-lg hover:shadow-red-500/50"
          >
            🔥 ENTRAR NA ARENA AGORA! 🔥
          </button>

          {nextArena && timeUntilNextArena > 0 && (
            <div className="mt-4 rounded-lg p-3 bg-blue-900/30 border border-blue-500/50 text-center text-white">
              <div className="text-xs text-gray-300">Próxima edição: <span className="font-bold text-blue-400">{nextArena.name}</span> em {formatTimeRemaining(timeUntilNextArena)}</div>
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg p-6 text-center"
        >
          <div className="text-4xl mb-3">⏰</div>
          <h2 className="text-xl sm:text-2xl font-bold mb-2">Nenhuma Arena Ativa</h2>
          
          {nextArena ? (
            <div className="mt-4">
              <p className="text-gray-300 mb-2">
                Próxima arena: <span className="font-bold text-purple-400">{nextArena.name}</span>
              </p>
              <div className="bg-gradient-to-r from-purple-900/50 to-indigo-900/50 rounded-xl p-5 sm:p-6 border-2 border-purple-500/50 inline-block min-w-[200px]">
                <div className="text-xs font-semibold text-gray-300 mb-2 uppercase tracking-wide">Contagem regressiva</div>
                <div className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 tabular-nums">
                  {timeUntilNextArena > 0 ? formatTimeRemaining(timeUntilNextArena) : '0:00:00'}
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  Início: {new Date(nextArena.startTime).toLocaleString('pt-BR')}
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-4">
                As arenas abrem em horários programados. Volte quando o contador chegar a zero!
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-2">
              Nenhuma arena programada no momento. As arenas aparecem em horários específicos.
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
}
