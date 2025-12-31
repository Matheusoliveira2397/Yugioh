import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { motion } from 'framer-motion';
import axios from 'axios';

interface News {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  author?: { nickname: string; clanTag?: string };
  image?: string;
  isPinned?: boolean;
}

interface Player {
  id: string | number;
  nickname: string;
  username: string;
  clanTag?: string;
  totalScore?: number;
  level?: number;
  wins: number;
  losses: number;
  profileImage?: string;
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [latestNews, setLatestNews] = useState<News[]>([]);
  const [topPlayers, setTopPlayers] = useState<Player[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const navigate = useNavigate();
  const { login } = useAuthStore();

  useEffect(() => {
    loadPublicData();
  }, []);

  const loadPublicData = async () => {
    try {
      setLoadingData(true);
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      
      console.log('🔄 [LoginPage] Carregando dados públicos...');
      
      // Buscar notícias e top 5 duelistas em paralelo (endpoints públicos)
      const [newsRes, top5Res] = await Promise.all([
        axios.get(`${API_URL}/news/latest?limit=5`).catch(err => {
          console.error('❌ [LoginPage] Erro ao buscar notícias:', err.response?.data || err.message);
          return { data: [] };
        }),
        axios.get(`${API_URL}/users/ranking/top5`).catch(err => {
          console.error('❌ [LoginPage] Erro ao buscar top 5 duelistas:', err.response?.data || err.message);
          return { data: [] };
        }),
      ]);
      
      console.log('✅ [LoginPage] Notícias recebidas:', newsRes.data);
      console.log('✅ [LoginPage] Top 5 duelistas recebidos:', top5Res.data);
      
      // Processar notícias
      if (newsRes.data && Array.isArray(newsRes.data)) {
        setLatestNews(newsRes.data);
      } else {
        console.warn('⚠️ [LoginPage] Notícias não é um array:', newsRes.data);
        setLatestNews([]);
      }
      
      // Processar top 5 duelistas
      let top5: Player[] = [];
      if (top5Res.data && Array.isArray(top5Res.data)) {
        top5 = top5Res.data.slice(0, 5).map((player: any) => ({
          id: player.id || player.userId || '',
          nickname: player.nickname || '',
          username: player.username || player.nickname || '',
          clanTag: player.clanTag || undefined,
          totalScore: player.totalScore || player.score || 0,
          level: player.level || 1,
          wins: player.wins || player.winsGeral || player.winsSeason || 0,
          losses: player.losses || player.lossesGeral || player.lossesSeason || 0,
          profileImage: player.profileImage || '/images/default.png',
        }));
        console.log('✅ [LoginPage] Top 5 mapeado:', top5);
      } else {
        console.warn('⚠️ [LoginPage] Top 5 não é um array:', top5Res.data);
      }
      
      console.log('✅ [LoginPage] Top 5 players processados:', top5);
      setTopPlayers(top5);
    } catch (error: any) {
      console.error('❌ [LoginPage] Erro ao carregar dados públicos:', error);
      console.error('❌ [LoginPage] Detalhes:', error.response?.data || error.message);
      // Definir arrays vazios em caso de erro
      setLatestNews([]);
      setTopPlayers([]);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await login(username, password);
      navigate('/home');
    } catch (err: any) {
      const message = err.response?.data?.message || 'Usuário ou senha inválidos';
      if (message.includes('confirme seu email')) {
        setError('Por favor, confirme seu email antes de fazer login. Verifique sua caixa de entrada.');
      } else {
        setError(message);
      }
    }
  };

  return (
    <div 
      className="min-h-screen py-8 px-4 relative overflow-hidden"
      style={{
        backgroundImage: 'url(/images/backgroundLogin.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Overlay gradiente moderno */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-purple-900/40 to-black/80"></div>
      
      {/* Grid de fundo animado */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(rgba(139, 92, 246, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.1) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }}></div>
      </div>
      
      <div className="max-w-7xl mx-auto relative z-20">
        {/* Header Principal */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8 pt-6"
        >
          <motion.h1 
            className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-3 bg-gradient-to-r from-blue-400 via-purple-500 via-pink-500 to-yellow-400 bg-clip-text text-transparent drop-shadow-2xl"
            animate={{ 
              backgroundPosition: ['0%', '100%', '0%'],
            }}
            transition={{ 
              duration: 5, 
              repeat: Infinity, 
              ease: "linear" 
            }}
            style={{
              backgroundSize: '200% auto',
            }}
          >
            Yu-Gi-Oh! Online
          </motion.h1>
          <p className="text-lg sm:text-xl text-gray-200 font-medium mb-2">Prepare-se para o Duelo dos Séculos!</p>
          <div className="flex items-center justify-center gap-4 text-sm text-gray-300">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              Servidor Online
            </span>
            <span>•</span>
            <span>Milhares de Duelistas</span>
            <span>•</span>
            <span>100% Gratuito</span>
          </div>
        </motion.div>

        {/* Layout Principal - Grid Responsivo */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Coluna Esquerda - Informações do Jogo */}
          <div className="lg:col-span-2 space-y-6">
            {/* Cards de Informações Importantes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card: Recursos do Jogo */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="bg-gradient-to-br from-blue-900/80 to-purple-900/80 backdrop-blur-md rounded-2xl p-6 border-2 border-blue-500/50 shadow-2xl hover:border-blue-400 transition-all"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-2xl">
                    ⚔️
                  </div>
                  <h3 className="text-xl font-bold text-blue-300">Recursos do Jogo</h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-200">
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">✓</span>
                    <span>Construa seus decks personalizados</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">✓</span>
                    <span>Participe de torneios e eventos</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">✓</span>
                    <span>Sistema de ranking competitivo</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">✓</span>
                    <span>Loja de cartas e colecionáveis</span>
                  </li>
                </ul>
              </motion.div>

              {/* Card: Estatísticas */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="bg-gradient-to-br from-purple-900/80 to-pink-900/80 backdrop-blur-md rounded-2xl p-6 border-2 border-purple-500/50 shadow-2xl hover:border-purple-400 transition-all"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center text-2xl">
                    📊
                  </div>
                  <h3 className="text-xl font-bold text-purple-300">Estatísticas</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-300">1000+</p>
                    <p className="text-xs text-gray-300">Cartas Disponíveis</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-pink-300">500+</p>
                    <p className="text-xs text-gray-300">Duelistas Ativos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-300">50+</p>
                    <p className="text-xs text-gray-300">Torneios/Mês</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-yellow-300">24/7</p>
                    <p className="text-xs text-gray-300">Disponível</p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Últimas Notícias */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-md rounded-2xl shadow-2xl p-6 border-2 border-blue-500/50"
            >
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-3 text-blue-400">
                <span className="text-3xl">📰</span>
                <span>Últimas Notícias</span>
              </h2>

              {loadingData ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
                  <p className="text-gray-400 mt-2">Carregando notícias...</p>
                </div>
              ) : latestNews.length > 0 ? (
                <div className="space-y-3">
                  {latestNews.map((news, index) => (
                    <motion.div
                      key={news.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1, duration: 0.4 }}
                      className="bg-gray-800/50 hover:bg-gray-800 rounded-xl p-4 transition-all border border-gray-700/50 hover:border-blue-500/50 hover:shadow-lg cursor-pointer group"
                    >
                      <div className="flex items-start gap-3">
                        {news.image && (
                          <img 
                            src={news.image.startsWith('http') ? news.image : `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${news.image}`}
                            alt={news.title}
                            className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {news.isPinned && <span className="text-yellow-400 text-xs">📌</span>}
                            <h3 className="text-base font-bold text-blue-400 group-hover:text-blue-300 transition-colors line-clamp-1">
                              {news.title}
                            </h3>
                          </div>
                          <p className="text-gray-300 text-sm line-clamp-2 mb-2">{news.content}</p>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <span>📅</span>
                              {new Date(news.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                            {news.author && (
                              <span className="flex items-center gap-1">
                                <span>✍️</span>
                                {news.author.clanTag ? `|${news.author.clanTag}| ` : ''}{news.author.nickname}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p>Nenhuma notícia disponível no momento</p>
                </div>
              )}
            </motion.div>
          </div>

          {/* Coluna Direita - Login e Top Players */}
          <div className="space-y-6">
            {/* Login Form */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-md rounded-2xl shadow-2xl p-6 border-2 border-purple-500/50"
            >
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                  Entrar no Jogo
                </h2>
                <p className="text-sm text-gray-400">Acesse sua conta e comece a duelar</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="username" className="block text-sm font-semibold mb-2 text-gray-200">
                    Usuário
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-400">👤</span>
                    </div>
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-gray-800/70 backdrop-blur-sm border-2 border-gray-600/70 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-white placeholder-gray-400"
                      placeholder="Digite seu usuário"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-semibold mb-2 text-gray-200">
                    Senha
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-400">🔒</span>
                    </div>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-gray-800/70 backdrop-blur-sm border-2 border-gray-600/70 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-white placeholder-gray-400"
                      placeholder="Digite sua senha"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-500/20 backdrop-blur-sm border-2 border-red-500/70 text-red-200 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
                  >
                    <span>⚠️</span>
                    <span>{error}</span>
                  </motion.div>
                )}

                <button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 text-white font-bold py-3 rounded-xl transition-all transform hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] shadow-lg"
                >
                  🎮 Entrar no Jogo
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-gray-700/50">
                <p className="text-center text-sm text-gray-300">
                  Não tem uma conta?{' '}
                  <Link to="/register" className="text-purple-400 hover:text-purple-300 font-semibold transition-colors underline decoration-purple-400/50 hover:decoration-purple-300">
                    Criar conta gratuita
                  </Link>
                </p>
              </div>
            </motion.div>

            {/* Top 5 Duelistas */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="bg-gradient-to-br from-yellow-900/80 to-orange-900/80 backdrop-blur-md rounded-2xl shadow-2xl p-6 border-2 border-yellow-500/50"
            >
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-3 text-yellow-400">
                <span className="text-3xl">🏆</span>
                <span>Top 5 Duelistas</span>
              </h2>

              {loadingData ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
                  <p className="text-gray-400 mt-2">Carregando ranking...</p>
                </div>
              ) : topPlayers.length > 0 ? (
                <div className="space-y-2">
                  {topPlayers.map((player, index) => (
                    <motion.div
                      key={player.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05, duration: 0.4 }}
                      className={`rounded-xl p-3 flex items-center gap-3 transition-all border-2 hover:shadow-lg group ${
                        index === 0 ? 'bg-gradient-to-r from-yellow-900/40 to-yellow-800/30 border-yellow-500/70 shadow-lg' :
                        index === 1 ? 'bg-gradient-to-r from-gray-700/40 to-gray-600/30 border-gray-400/70' :
                        index === 2 ? 'bg-gradient-to-r from-orange-900/40 to-orange-800/30 border-orange-500/70' :
                        'bg-gray-800/40 border-gray-700/70 hover:border-purple-500/50'
                      }`}
                    >
                      <span className={`text-xl font-bold min-w-[40px] flex items-center justify-center ${
                        index === 0 ? 'text-yellow-400' :
                        index === 1 ? 'text-gray-300' :
                        index === 2 ? 'text-orange-400' :
                        'text-gray-500'
                      }`}>
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                      </span>
                      <div className="flex-shrink-0">
                        <img
                          src={
                            player.profileImage 
                              ? player.profileImage.startsWith('http') 
                                ? player.profileImage 
                                : `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${player.profileImage}`
                              : '/images/default.png'
                          }
                          alt={player.nickname || player.username}
                          className="w-12 h-12 rounded-full object-cover border-2 border-purple-500 group-hover:border-purple-400 transition-colors shadow-md"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/images/default.png';
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white truncate text-sm group-hover:text-purple-300 transition-colors">
                          {player.clanTag ? `|${player.clanTag}| ${player.nickname || player.username}` : (player.nickname || player.username)}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-green-400 font-semibold">{player.wins || 0}V</span>
                          <span className="text-gray-600">/</span>
                          <span className="text-xs text-red-400 font-semibold">{player.losses || 0}D</span>
                          <span className="text-gray-600">•</span>
                          <span className="text-xs text-yellow-400">Nv.{player.level || 1}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p>Nenhum jogador ranqueado ainda</p>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
