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
      className="min-h-screen py-12 px-4 relative overflow-hidden"
      style={{
        backgroundImage: 'url(/images/backgroundLogin.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Overlay escuro para melhorar legibilidade */}
      <div className="absolute inset-0 bg-black bg-opacity-60"></div>
      
      {/* Container do Login com imagens laterais - Superior direito */}
      <div className="absolute top-6 right-6 z-30 flex items-center gap-6">
        {/* Jaden à esquerda */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="hidden lg:block"
        >
          <img 
            src="/images/jadenLogin.png" 
            alt="Jaden"
            className="w-40 h-52 md:w-48 md:h-64 object-contain drop-shadow-2xl"
          />
        </motion.div>

        {/* Login Form */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-80 sm:w-96"
        >
          <div className="bg-transparent rounded-2xl p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-semibold mb-2 text-gray-200">
                  Usuário
                </label>
                <div className="relative">
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800/50 backdrop-blur-sm border-2 border-gray-600/70 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-white placeholder-gray-400"
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
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800/50 backdrop-blur-sm border-2 border-gray-600/70 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-white placeholder-gray-400"
                    placeholder="Digite sua senha"
                    required
                  />
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-500/30 backdrop-blur-sm border-2 border-red-500/70 text-red-200 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
                >
                  <span>⚠️</span>
                  <span>{error}</span>
                </motion.div>
              )}

              <button 
                type="submit" 
                className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 text-white font-bold py-3 rounded-xl transition-all transform hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] shadow-md"
              >
                Entrar
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-600/50">
              <p className="text-center text-sm text-gray-300">
                Não tem uma conta?{' '}
                <Link to="/register" className="text-purple-400 hover:text-purple-300 font-semibold transition-colors underline decoration-purple-400/50 hover:decoration-purple-300">
                  Criar conta
                </Link>
              </p>
            </div>
          </div>
        </motion.div>

        {/* Yugi à direita */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="hidden lg:block"
        >
          <img 
            src="/images/yugiLogin.png" 
            alt="Yugi"
            className="w-40 h-52 md:w-48 md:h-64 object-contain drop-shadow-2xl"
          />
        </motion.div>
      </div>
      
      {/* Conteúdo principal */}
      <div className="max-w-7xl mx-auto relative z-20 pt-20 sm:pt-16 px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center mb-6"
        >
          <motion.h1 
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-2 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-2xl"
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
          <p className="text-base sm:text-lg text-gray-200 font-medium">Prepare-se para duelar!</p>
        </motion.div>

        {/* Main Content */}
        <div className="space-y-4 max-w-3xl ml-0 mr-auto">
            {/* Latest News */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-2xl shadow-2xl p-5 border-2 border-blue-500/50">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-blue-400">
                  <span className="text-2xl">📰</span>
                  <span>Últimas Notícias</span>
                </h2>

                {loadingData ? (
                  <div className="text-center py-8">
                    <p className="text-gray-400">Carregando notícias...</p>
                  </div>
                ) : latestNews.length > 0 ? (
                  <div className="space-y-2">
                    {latestNews.map((news, index) => (
                      <motion.div
                        key={news.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1, duration: 0.4 }}
                        className="bg-gray-700/50 hover:bg-gray-700 rounded-lg p-3 transition-all border border-gray-600/50 hover:border-blue-500/50 hover:shadow-lg cursor-pointer group"
                      >
                        <h3 className="text-base font-bold text-blue-400 group-hover:text-blue-300 mb-1 transition-colors">{news.title}</h3>
                        <p className="text-gray-300 text-xs line-clamp-2 mb-2">{news.content}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <span>📅</span>
                          {new Date(news.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p>Nenhuma notícia disponível no momento</p>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Top Players */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-2xl shadow-2xl p-5 border-2 border-yellow-500/50 max-w-md">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-yellow-400">
                  <span className="text-2xl">🏆</span>
                  <span>Top 5 Duelistas</span>
                </h2>

                {loadingData ? (
                  <div className="text-center py-8">
                    <p className="text-gray-400">Carregando ranking...</p>
                  </div>
                ) : topPlayers.length > 0 ? (
                  <div className="space-y-2">
                    {topPlayers.map((player, index) => (
                      <motion.div
                        key={player.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.4 }}
                        className={`rounded-lg p-3 flex items-center gap-3 transition-all border-2 hover:shadow-lg group ${
                          index === 0 ? 'bg-gradient-to-r from-yellow-900/30 to-yellow-800/20 border-yellow-500/50' :
                          index === 1 ? 'bg-gradient-to-r from-gray-700/30 to-gray-600/20 border-gray-400/50' :
                          index === 2 ? 'bg-gradient-to-r from-orange-900/30 to-orange-800/20 border-orange-500/50' :
                          'bg-gray-700/30 border-gray-600/50 hover:border-purple-500/50'
                        }`}
                      >
                        <span className={`text-lg font-bold min-w-[35px] flex items-center justify-center ${
                          index === 0 ? 'text-yellow-400' :
                          index === 1 ? 'text-gray-300' :
                          index === 2 ? 'text-orange-400' :
                          'text-gray-500'
                        }`}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                        </span>
                        {/* Foto do perfil */}
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
                            className="w-10 h-10 rounded-full object-cover border-2 border-purple-500 group-hover:border-purple-400 transition-colors shadow-md"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/images/default.png';
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white truncate text-sm group-hover:text-purple-300 transition-colors">
                            {player.clanTag ? `|${player.clanTag}| ${player.nickname || player.username}` : (player.nickname || player.username)}
                          </p>
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <span className="text-green-400">{player.wins || 0}V</span>
                            <span className="text-gray-600">/</span>
                            <span className="text-red-400">{player.losses || 0}D</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">{player.level || 1}</p>
                          <p className="text-xs text-gray-500">Nível</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p>Nenhum jogador ranqueado ainda</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
  );
}
