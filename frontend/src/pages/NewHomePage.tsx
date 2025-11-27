import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface RankingPlayer {
  rank: number;
  id: string;
  nickname: string;
  clanTag?: string;
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
  author: { nickname: string; clanTag?: string };
  createdAt: string;
  image?: string;
  isPinned: boolean;
}


export default function HomePage() {
  const { token } = useAuthStore();
  const navigate = useNavigate();

  // Estados
  const [topPlayers, setTopPlayers] = useState<RankingPlayer[]>([]);
  const [topClans, setTopClans] = useState<Clan[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Buscar dados mesmo sem token (endpoints são públicos)
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Criar headers apenas se tiver token válido
      const headers: any = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      console.log('🔄 [NewHomePage] Buscando dados...');
      console.log('🔄 [NewHomePage] Token disponível:', !!token);

      // Buscar todas as informações em paralelo (endpoints públicos) - timeout aumentado para evitar problemas com WebSocket
      const [playersRes, clansRes, newsRes] = await Promise.all([
        Promise.race([
          axios.get(`${API_URL}/users/ranking/top5`, { headers, timeout: 20000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
        ]).catch(err => {
          console.warn('⚠️ Erro ao buscar top players:', err.message);
          return { data: [] };
        }),
        Promise.race([
          axios.get(`${API_URL}/groups/ranking/top5`, { headers, timeout: 20000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
        ]).catch(err => {
          console.warn('⚠️ Erro ao buscar top clãs:', err.message);
          return { data: [] };
        }),
        Promise.race([
          axios.get(`${API_URL}/news/latest?limit=10`, { headers, timeout: 20000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
        ]).catch(err => {
          console.warn('⚠️ Erro ao buscar notícias:', err.message);
          return { data: [] };
        }),
      ]);

      console.log('✅ [NewHomePage] Top players recebidos:', playersRes.data);
      console.log('✅ [NewHomePage] Top clãs recebidos:', clansRes.data);
      console.log('✅ [NewHomePage] Notícias recebidas:', newsRes.data);
      
      if (playersRes.data && Array.isArray(playersRes.data)) {
        setTopPlayers(playersRes.data);
      } else {
        console.warn('⚠️ [NewHomePage] Top players não é um array:', playersRes.data);
        setTopPlayers([]);
      }
      
      if (clansRes.data && Array.isArray(clansRes.data)) {
        setTopClans(clansRes.data);
      } else {
        console.warn('⚠️ [NewHomePage] Top clãs não é um array:', clansRes.data);
        setTopClans([]);
      }
      
      if (newsRes.data && Array.isArray(newsRes.data)) {
        setNews(newsRes.data);
      } else {
        console.warn('⚠️ [NewHomePage] Notícias não é um array:', newsRes.data);
        setNews([]);
      }
    } catch (error: any) {
      console.error('❌ [NewHomePage] Erro ao buscar dados:', error);
      console.error('❌ [NewHomePage] Detalhes:', error.response?.data || error.message);
      // Definir arrays vazios em caso de erro
      setTopPlayers([]);
      setTopClans([]);
      setNews([]);
    } finally {
      setLoading(false);
    }
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
      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Esquerda - Rankings */}
        <div className="lg:col-span-1 space-y-6">
          {/* Top 5 Jogadores */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800 rounded-lg p-6 shadow-xl"
          >
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
                    src={player.profileImage || '/images/default.png'}
                    alt={player.nickname}
                    className="w-10 h-10 rounded-full"
                  />
                  <div className="flex-1">
                    <div className="font-bold">{player.clanTag ? `|${player.clanTag}| ${player.nickname}` : player.nickname}</div>
                    <div className="text-sm text-gray-400">
                      Score: {player.score} | {player.wins || 0}V - {player.losses || 0}D
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
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gray-800 rounded-lg p-6 shadow-xl"
          >
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

        {/* Coluna Central - Notícias */}
        <div className="lg:col-span-2">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gray-800 rounded-lg p-6 shadow-xl"
          >
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
                      Por: {item.author?.clanTag ? `|${item.author.clanTag}| ${item.author?.nickname || 'Admin'}` : (item.author?.nickname || 'Admin')}
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
    </div>
  );
}
