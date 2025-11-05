import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSocketStore } from '../stores/socketStore';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface RankingPlayer {
  rank: number;
  id: string;
  nickname: string;
  profileImage?: string;
  rating: number;
  wins: number;
  losses: number;
  score: number;
  division?: string;
}

interface Clan {
  rank: number;
  id: string;
  name: string;
  tag: string;
  totalScore: number;
  memberCount: number;
  leaderName: string;
}

interface News {
  id: string;
  title: string;
  content: string;
  author: { nickname: string };
  createdAt: string;
  image?: string;
  isPinned: boolean;
}

interface Arena {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  startTime: string;
  endTime: string;
  participants: number;
  scoreMultiplier: number;
  bonusGems: number;
  isCurrentlyActive?: boolean;
  timeRemainingMs?: number;
}

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: string;
  avatar?: string;
}

export default function HomePage() {
  const { user, token } = useAuthStore();
  const { socket, connect } = useSocketStore();
  const navigate = useNavigate();

  // Estados
  const [activeTab, setActiveTab] = useState<'home' | 'chat'>('home');
  const [topPlayers, setTopPlayers] = useState<RankingPlayer[]>([]);
  const [topClans, setTopClans] = useState<Clan[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [arena, setArena] = useState<Arena | null>(null);
  const [nextArenaTime, setNextArenaTime] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [inArena, setInArena] = useState(false);

  useEffect(() => {
    if (token) {
      connect(token);
      fetchData();
      fetchArenaStatus();
    }
  }, [token]);

  // Socket listeners para chat
  useEffect(() => {
    if (!socket) return;

    socket.on('chat:message', (message: ChatMessage) => {
      setChatMessages(prev => [...prev, message]);
    });

    socket.on('chat:history', (history: ChatMessage[]) => {
      setChatMessages(history);
    });

    return () => {
      socket.off('chat:message');
      socket.off('chat:history');
    };
  }, [socket]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const headers = { Authorization: `Bearer ${token}` };

      // Buscar todas as informações em paralelo
      const [playersRes, clansRes, newsRes] = await Promise.all([
        axios.get(`${API_URL}/users/ranking/top5`, { headers }),
        axios.get(`${API_URL}/groups/ranking/top5`, { headers }),
        axios.get(`${API_URL}/news/latest?limit=10`, { headers }),
      ]);

      setTopPlayers(playersRes.data);
      setTopClans(clansRes.data);
      setNews(newsRes.data);
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchArenaStatus = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      // Buscar arena atual
      const currentRes = await axios.get(`${API_URL}/arena/current`, { headers });
      
      if (currentRes.data.arena) {
        setArena(currentRes.data.arena);
        setNextArenaTime('');
      } else {
        // Buscar próxima arena
        const nextRes = await axios.get(`${API_URL}/arena/next`, { headers });
        if (nextRes.data.arena) {
          setArena(nextRes.data.arena);
          const timeUntil = new Date(nextRes.data.startsAt).getTime() - Date.now();
          setNextArenaTime(formatTime(timeUntil));
        }
      }
    } catch (error) {
      console.error('Erro ao buscar status da arena:', error);
    }
  };

  const formatTime = (ms: number): string => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const handleJoinArena = async () => {
    if (!arena) return;
    
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`${API_URL}/arena/join/${arena.id}`, {}, { headers });
      setInArena(true);
      // Redirecionar para matchmaking com filtro de arena
      navigate('/random-duel?arena=true');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao entrar na arena');
    }
  };

  const handleSendMessage = () => {
    if (!chatInput.trim() || !socket) return;

    socket.emit('chat:send', { message: chatInput });
    setChatInput('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-2xl">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header com Perfil do Usuário */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-blue-900 to-purple-900 rounded-lg p-6 mb-8 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <img 
              src={user?.profileImage || '/avatars/default.png'} 
              alt={user?.nickname}
              className="w-20 h-20 rounded-full border-4 border-yellow-400"
            />
            <div>
              <h1 className="text-4xl font-bold mb-2">
                Bem-vindo, {user?.nickname}! 👋
              </h1>
              <div className="flex gap-6 text-lg">
                <div>
                  <span className="text-gray-400">Vitórias:</span>{' '}
                  <span className="text-green-400 font-bold">{user?.wins || 0}</span>
                </div>
                <div>
                  <span className="text-gray-400">Derrotas:</span>{' '}
                  <span className="text-red-400 font-bold">{user?.losses || 0}</span>
                </div>
                <div>
                  <span className="text-gray-400">Rating:</span>{' '}
                  <span className="text-yellow-400 font-bold">{user?.rating || 1000}</span>
                </div>
                <div>
                  <span className="text-gray-400">Gemas:</span>{' '}
                  <span className="text-blue-400 font-bold">💎 {user?.gems || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Abas Principais */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveTab('home')}
          className={`px-6 py-3 rounded-lg font-bold transition-all ${
            activeTab === 'home'
              ? 'bg-blue-600 text-white shadow-lg scale-105'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          🏠 Início
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`px-6 py-3 rounded-lg font-bold transition-all ${
            activeTab === 'chat'
              ? 'bg-green-600 text-white shadow-lg scale-105'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          💬 Chat Global
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'home' && (
          <motion.div
            key="home"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            {/* Grid Principal */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Coluna Esquerda - Rankings */}
              <div className="lg:col-span-1 space-y-6">
                {/* Top 5 Jogadores */}
                <motion.div className="bg-gray-800 rounded-lg p-6 shadow-xl">
                  <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                    🏆 Top 5 Duelistas
                  </h2>
                  <div className="space-y-3">
                    {topPlayers.map((player) => (
                      <div
                        key={player.id}
                        className={`flex items-center gap-3 p-3 rounded-lg ${
                          player.rank === 1 ? 'bg-yellow-900/30 border border-yellow-500' :
                          player.rank === 2 ? 'bg-gray-700/50 border border-gray-500' :
                          player.rank === 3 ? 'bg-orange-900/30 border border-orange-700' :
                          'bg-gray-700/30'
                        }`}
                      >
                        <div className="text-2xl font-bold w-8">
                          {player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : player.rank === 3 ? '🥉' : `${player.rank}º`}
                        </div>
                        <img 
                          src={player.profileImage || '/avatars/default.png'}
                          alt={player.nickname}
                          className="w-10 h-10 rounded-full"
                        />
                        <div className="flex-1">
                          <div className="font-bold">{player.nickname}</div>
                          <div className="text-sm text-gray-400">
                            Score: {player.score} | {player.wins}V - {player.losses}D
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => navigate('/ranking')}
                    className="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-lg transition"
                  >
                    Ver Ranking Completo
                  </button>
                </motion.div>

                {/* Top 5 Clãs */}
                <motion.div className="bg-gray-800 rounded-lg p-6 shadow-xl">
                  <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                    ⚔️ Top 5 Clãs
                  </h2>
                  <div className="space-y-3">
                    {topClans.map((clan) => (
                      <div
                        key={clan.id}
                        onClick={() => navigate(`/groups/${clan.id}`)}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-gray-700 transition ${
                          clan.rank === 1 ? 'bg-yellow-900/30 border border-yellow-500' :
                          clan.rank === 2 ? 'bg-gray-700/50 border border-gray-500' :
                          clan.rank === 3 ? 'bg-orange-900/30 border border-orange-700' :
                          'bg-gray-700/30'
                        }`}
                      >
                        <div className="text-2xl font-bold w-8">
                          {clan.rank === 1 ? '🥇' : clan.rank === 2 ? '🥈' : clan.rank === 3 ? '🥉' : `${clan.rank}º`}
                        </div>
                        <div className="flex-1">
                          <div className="font-bold">[{clan.tag}] {clan.name}</div>
                          <div className="text-sm text-gray-400">
                            Score: {clan.totalScore} | Membros: {clan.memberCount}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => navigate('/groups')}
                    className="mt-4 w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 rounded-lg transition"
                  >
                    Ver Todos os Clãs
                  </button>
                </motion.div>
              </div>

              {/* Coluna Central - Notícias e Ações */}
              <div className="lg:col-span-2 space-y-6">
                {/* Arena de Desafios */}
                {arena && (
                  <motion.div
                    initial={{ scale: 0.9 }}
                    animate={{ scale: 1 }}
                    className={`rounded-lg p-6 shadow-2xl ${
                      arena.isCurrentlyActive || (arena.endTime && new Date(arena.endTime) > new Date())
                        ? 'bg-gradient-to-r from-red-900 to-orange-900 border-2 border-red-500'
                        : 'bg-gradient-to-r from-gray-800 to-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-3xl font-bold flex items-center gap-2">
                          ⚔️ {arena.name}
                        </h2>
                        <p className="text-gray-300 mt-2">{arena.description}</p>
                      </div>
                      {arena.isCurrentlyActive && (
                        <div className="text-right">
                          <div className="text-sm text-gray-400">Participantes</div>
                          <div className="text-3xl font-bold">{arena.participants}</div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="bg-black/30 rounded-lg p-3 text-center">
                        <div className="text-yellow-400 font-bold text-xl">{arena.scoreMultiplier}x</div>
                        <div className="text-sm text-gray-400">Multiplicador</div>
                      </div>
                      <div className="bg-black/30 rounded-lg p-3 text-center">
                        <div className="text-blue-400 font-bold text-xl">💎 {arena.bonusGems}</div>
                        <div className="text-sm text-gray-400">Bônus</div>
                      </div>
                      <div className="bg-black/30 rounded-lg p-3 text-center">
                        <div className="text-green-400 font-bold text-xl">2h</div>
                        <div className="text-sm text-gray-400">Duração</div>
                      </div>
                    </div>

                    {arena.isCurrentlyActive || (arena.endTime && new Date(arena.endTime) > new Date()) ? (
                      <button
                        onClick={handleJoinArena}
                        disabled={inArena}
                        className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-bold py-4 rounded-lg text-xl transition shadow-lg"
                      >
                        {inArena ? '✓ Na Arena' : '🔥 ENTRAR NA ARENA 🔥'}
                      </button>
                    ) : (
                      <div className="text-center">
                        <div className="text-xl mb-2">Próxima Arena em:</div>
                        <div className="text-3xl font-bold text-yellow-400">{nextArenaTime}</div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Ações Rápidas */}
                <div className="grid grid-cols-2 gap-4">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => navigate('/random-duel')}
                    className="bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white font-bold py-6 rounded-lg shadow-xl"
                  >
                    <div className="text-4xl mb-2">⚡</div>
                    <div className="text-xl">Duelo Rápido</div>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => navigate('/tournaments')}
                    className="bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white font-bold py-6 rounded-lg shadow-xl"
                  >
                    <div className="text-4xl mb-2">🏆</div>
                    <div className="text-xl">Torneios</div>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => navigate('/shop')}
                    className="bg-gradient-to-r from-green-600 to-green-800 hover:from-green-700 hover:to-green-900 text-white font-bold py-6 rounded-lg shadow-xl"
                  >
                    <div className="text-4xl mb-2">🛒</div>
                    <div className="text-xl">Loja</div>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => navigate('/decks')}
                    className="bg-gradient-to-r from-orange-600 to-orange-800 hover:from-orange-700 hover:to-orange-900 text-white font-bold py-6 rounded-lg shadow-xl"
                  >
                    <div className="text-4xl mb-2">📦</div>
                    <div className="text-xl">Meus Decks</div>
                  </motion.button>
                </div>

                {user?.role === 'ADMIN' || user?.role === 'MASTER' ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate('/admin')}
                    className="w-full bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white font-bold py-4 rounded-lg shadow-xl"
                  >
                    <div className="text-2xl">🛡️ Painel Administrativo</div>
                  </motion.button>
                ) : null}

                {/* Notícias */}
                <motion.div className="bg-gray-800 rounded-lg p-6 shadow-xl">
                  <h2 className="text-3xl font-bold mb-6 flex items-center gap-2">
                    📰 Últimas Notícias
                  </h2>
                  <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    {news.length > 0 ? (
                      news.map((item) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`rounded-lg p-4 border-l-4 ${
                            item.isPinned 
                              ? 'bg-yellow-900/20 border-yellow-500' 
                              : 'bg-gray-900 border-blue-500'
                          }`}
                        >
                          {item.isPinned && (
                            <div className="text-yellow-500 text-sm font-bold mb-1">📌 FIXADO</div>
                          )}
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="text-xl font-bold">{item.title}</h3>
                            <span className="text-gray-500 text-sm">
                              {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          <p className="text-gray-300 mb-2">{item.content}</p>
                          <div className="text-sm text-gray-500">
                            Por: {item.author?.nickname || 'Admin'}
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        Nenhuma notícia disponível
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'chat' && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-gray-800 rounded-lg p-6 shadow-xl"
          >
            <h2 className="text-3xl font-bold mb-4">💬 Chat Global</h2>
            
            <div className="bg-gray-900 rounded-lg p-4 h-[500px] overflow-y-auto mb-4">
              {chatMessages.length > 0 ? (
                chatMessages.map((msg, index) => (
                  <div key={index} className="mb-3 flex items-start gap-2">
                    <img 
                      src={msg.avatar || '/avatars/default.png'}
                      alt={msg.username}
                      className="w-8 h-8 rounded-full"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-400">{msg.username}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(msg.timestamp).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>
                      <div className="text-gray-300">{msg.message}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 py-8">
                  Nenhuma mensagem ainda. Seja o primeiro a enviar!
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Digite sua mensagem..."
                className="flex-1 bg-gray-900 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSendMessage}
                disabled={!chatInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold px-6 py-3 rounded-lg transition"
              >
                Enviar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
