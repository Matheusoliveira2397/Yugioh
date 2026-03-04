import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { logger } from '../utils/logger';
import LatestCardsMarquee from '../components/LatestCardsMarquee';

import { getImageUrl } from '../utils/imageUrl';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface RankingPlayer {
  rank: number;
  id: string;
  nickname: string;
  clanTag?: string;
  profileImage?: string;
  wins: number;
  losses: number;
  score: number;
  level?: number;
  division?: string;
}

interface Clan {
  rank: number;
  id: string;
  name: string;
  tag: string;
  logo?: string;
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
  isNew?: boolean; // Indica se a notícia é nova (não vista)
}

interface Card {
  id: string;
  idCarta: string;
  name: string;
  cardImage?: string;
  type: string;
  rarity?: string;
  createdAt: string;
}

export default function HomePage() {
  const { token, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Estados
  const [topPlayers, setTopPlayers] = useState<RankingPlayer[]>([]);
  const [topSeasonPlayers, setTopSeasonPlayers] = useState<RankingPlayer[]>([]);
  const [topClans, setTopClans] = useState<Clan[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [shopCards, setShopCards] = useState<Card[]>([]);
  const [viewedNewsIds, setViewedNewsIds] = useState<string[]>([]);
  const [nextArena, setNextArena] = useState<{ name: string; startTime: string } | null>(null);
  const [timeUntilNextArena, setTimeUntilNextArena] = useState<number>(0);
  
  // Função para entrar em um clã
  const handleJoinGroup = async (groupId: string) => {
    try {
      await axios.post(
        `${API_URL}/groups/join/${groupId}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      // Buscar dados atualizados do usuário após entrar no grupo
      try {
        const userResponse = await axios.get(
          `${API_URL}/users/me`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        
        if (userResponse.data) {
          const updatedUser = { ...user, ...userResponse.data };
          useAuthStore.setState({
            user: updatedUser,
          });
        }
      } catch (err) {
        console.error('❌ Erro ao buscar dados do usuário:', err);
      }
      
      alert('Você entrou no clã!');
      // Recarregar dados para atualizar a lista
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao entrar no clã');
    }
  };
  const [loading, setLoading] = useState(true);

  // Função para buscar notícias vistas e atualizar o estado
  const fetchViewedNews = useCallback(async () => {
    if (!token || !user) return;
    
    try {
      const response = await axios.get(`${API_URL}/news/views/user`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const viewedIds = response.data || [];
      setViewedNewsIds(viewedIds);
      
      // Atualizar o estado das notícias para remover o badge NEW
      setNews(prevNews => 
        prevNews.map(item => ({
          ...item,
          isNew: !viewedIds.includes(item.id),
        }))
      );
    } catch (error) {
      logger.error('Erro ao buscar notícias vistas:', error);
    }
  }, [token, user]);

  useEffect(() => {
    // Buscar dados mesmo sem token (endpoints são públicos)
    fetchData();
  }, [token, user]);

  // Recarregar notícias vistas quando a página recebe foco (usuário volta de outra página)
  useEffect(() => {
    const handleFocus = () => {
      if (token && user) {
        fetchViewedNews();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [token, user, fetchViewedNews]);

  // Recarregar notícias vistas quando voltar para a home (detecta mudança de rota)
  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '/home') {
      if (token && user) {
        // Pequeno delay para garantir que a notícia foi marcada como vista
        setTimeout(() => {
          fetchViewedNews();
        }, 500);
      }
    }
  }, [location.pathname, token, user, fetchViewedNews]);

  // Atualizar contagem regressiva da próxima arena a cada segundo
  useEffect(() => {
    if (!nextArena || timeUntilNextArena <= 0) return;
    const timer = setInterval(() => {
      setTimeUntilNextArena((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [nextArena, timeUntilNextArena]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Criar headers apenas se tiver token válido
      const headers: any = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      // Buscar notícias vistas primeiro se o usuário estiver logado
      let viewedIds: string[] = [];
      if (token && user) {
        try {
          const viewedResponse = await axios.get(`${API_URL}/news/views/user`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          viewedIds = viewedResponse.data || [];
          setViewedNewsIds(viewedIds);
        } catch (error) {
          logger.error('Erro ao buscar notícias vistas:', error);
        }
      }

      // Buscar todas as informações em paralelo (endpoints públicos) - timeout aumentado para evitar problemas com WebSocket
      const [playersRes, seasonPlayersRes, clansRes, newsRes, cardsRes, nextArenaRes] = await Promise.all([
        Promise.race([
          axios.get(`${API_URL}/users/ranking/general`, { headers, timeout: 20000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
        ]).catch(err => {
          logger.warn('Erro ao buscar ranking geral:', err.message);
          return { data: [] };
        }),
        Promise.race([
          axios.get(`${API_URL}/users/ranking/season`, { headers, timeout: 20000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
        ]).catch(err => {
          logger.warn('Erro ao buscar top season players:', err.message);
          return { data: [] };
        }),
        Promise.race([
          axios.get(`${API_URL}/groups/ranking/top5`, { headers, timeout: 20000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
        ]).catch(err => {
          logger.warn('Erro ao buscar top clãs:', err.message);
          return { data: [] };
        }),
        Promise.race([
          axios.get(`${API_URL}/news/latest?limit=10`, { headers, timeout: 20000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
        ]).catch(err => {
          logger.warn('Erro ao buscar notícias:', err.message);
          return { data: [] };
        }),
        Promise.race([
          axios.get(`${API_URL}/cards/shop/for-sale`, { headers, timeout: 20000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
        ]).catch(err => {
          logger.error('Erro ao buscar últimas cartas:', err);
          return { data: [] };
        }),
        Promise.race([
          axios.get(`${API_URL}/arena/next`, { headers, timeout: 10000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]).catch(() => ({ data: null })),
      ]);
      
      if (playersRes.data && Array.isArray(playersRes.data)) {
        // Pegar apenas os top 5 do ranking geral
        const top5General = playersRes.data.slice(0, 5).map((player: any, index: number) => ({
          ...player,
          rank: index + 1,
          score: player.totalScore || player.score || 0,
          wins: player.winsGeral || player.wins || 0,
          losses: player.lossesGeral || player.losses || 0,
        }));
        setTopPlayers(top5General);
      } else {
        logger.warn('Ranking geral não é um array');
        setTopPlayers([]);
      }
      
      if (seasonPlayersRes.data && Array.isArray(seasonPlayersRes.data)) {
        // Pegar apenas os top 5 da season
        const top5Season = seasonPlayersRes.data.slice(0, 5).map((player: any, index: number) => ({
          ...player,
          rank: index + 1,
          score: player.seasonScore || 0,
        }));
        setTopSeasonPlayers(top5Season);
      } else {
        logger.warn('Top season players não é um array');
        setTopSeasonPlayers([]);
      }
      
      if (clansRes.data && Array.isArray(clansRes.data)) {
        setTopClans(clansRes.data);
      } else {
        logger.warn('Top clãs não é um array');
        setTopClans([]);
      }
      
      if (newsRes.data && Array.isArray(newsRes.data)) {
        // Marcar notícias como novas se não foram vistas
        // Usar viewedIds da busca atual
        const newsWithNewFlag = newsRes.data.map((item: News) => ({
          ...item,
          isNew: !viewedIds.includes(item.id),
        }));
        setNews(newsWithNewFlag);
      } else {
        logger.warn('Notícias não é um array');
        setNews([]);
      }
      
      if (cardsRes.data && Array.isArray(cardsRes.data)) {
        // Apenas cartas que estão na loja (já vêm de /cards/shop/for-sale) — limitar para o carrossel
        setShopCards(cardsRes.data.slice(0, 16));
      } else {
        logger.warn('Cartas não é um array');
        setShopCards([]);
      }

      if (nextArenaRes?.data?.arena) {
        const startTime = nextArenaRes.data.arena.startTime;
        const until = nextArenaRes.data.timeUntilStart ?? (new Date(startTime).getTime() - Date.now());
        setNextArena({ name: nextArenaRes.data.arena.name, startTime });
        setTimeUntilNextArena(Math.max(0, until));
      } else {
        setNextArena(null);
        setTimeUntilNextArena(0);
      }
    } catch (error: any) {
      logger.error('Erro ao buscar dados:', error.response?.data || error.message);
      // Definir arrays vazios em caso de erro
      setTopPlayers([]);
      setTopSeasonPlayers([]);
      setTopClans([]);
      setNews([]);
      setShopCards([]);
      setNextArena(null);
      setTimeUntilNextArena(0);
    } finally {
      setLoading(false);
    }
  };


  const formatTimeRemaining = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-2xl">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4">
      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-3 md:gap-4">
        {/* Coluna Esquerda - Rankings (largura limitada para não ficar espaço vazio) */}
        <div className="lg:col-span-4 lg:max-w-[420px] space-y-2 sm:space-y-3">
          {/* Contador próxima arena */}
          {nextArena && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => navigate('/arena')}
              className="rounded-lg p-3 sm:p-4 border border-amber-500/40 bg-gradient-to-r from-amber-900/30 to-orange-900/30 hover:border-amber-400/60 transition-all cursor-pointer"
            >
              <h2 className="text-xs sm:text-sm font-bold mb-2 flex items-center gap-1.5 text-amber-200 drop-shadow-lg">
                ⏰ Próxima Arena
              </h2>
              <p className="text-white font-semibold text-sm mb-1 truncate">{nextArena.name}</p>
              <div className="text-xl sm:text-2xl font-bold text-amber-300 tabular-nums mb-2">
                {timeUntilNextArena > 0 ? formatTimeRemaining(timeUntilNextArena) : '0:00:00'}
              </div>
              <p className="text-white/70 text-[10px] sm:text-xs mb-2">
                Início: {new Date(nextArena.startTime).toLocaleString('pt-BR')}
              </p>
              <span className="text-amber-400 text-xs font-semibold hover:text-amber-300">Ir para Arena →</span>
            </motion.div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
            {/* Top 5 Season */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg p-2 sm:p-3 md:p-4 border border-blue-700/30 hover:border-blue-600/50 transition-all duration-300"
            >
              <h2 className="text-xs sm:text-sm font-bold mb-1.5 sm:mb-2 flex items-center gap-1 text-white drop-shadow-lg">
                🏆 Top 5 Season
              </h2>
              <div className="space-y-1 sm:space-y-1.5">
                {topSeasonPlayers.map((player) => (
                  <motion.div
                    key={player.id}
                    whileHover={{ scale: 1.02, x: 4 }}
                    className={`flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 md:p-2 rounded-md transition-all duration-200 ${
                      player.rank === 1 ? 'bg-transparent border border-blue-600/30 shadow-lg' :
                      player.rank === 2 ? 'bg-transparent border border-blue-700/20 shadow-md' :
                      player.rank === 3 ? 'bg-transparent border border-blue-700/20 shadow-md' :
                      'bg-transparent border border-blue-800/20 hover:border-blue-700/30'
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-bold w-5 sm:w-6 flex-shrink-0">
                      {player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : player.rank === 3 ? '🥉' : `${player.rank}º`}
                    </div>
                    <img
                      src={getImageUrl(player.profileImage)}
                      alt={player.nickname}
                      className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full flex-shrink-0 object-cover"
                      onError={(e) => {
                        e.currentTarget.src = '/images/default.png';
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[10px] sm:text-xs md:text-sm truncate text-white">{player.clanTag ? `|${player.clanTag}|` : ''} {player.nickname?.substring(0, 10)}</div>
                      <div className="text-[9px] sm:text-[10px] md:text-xs text-white/80">Score: {player.score || 0}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
              <button
                onClick={() => navigate('/ranking')}
                className="mt-1.5 sm:mt-2 w-full bg-transparent border border-blue-600/50 hover:border-blue-500 text-white font-semibold py-1.5 text-xs rounded-md transition-all"
              >
                Ver Mais
              </button>
            </motion.div>

            {/* Top 5 Geral */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-lg p-2 sm:p-3 md:p-4 border border-red-700/30 hover:border-red-600/50 transition-all duration-300"
            >
              <h2 className="text-xs sm:text-sm font-bold mb-1.5 sm:mb-2 flex items-center gap-1 text-white drop-shadow-lg">
                ⭐ Top 5 Geral
              </h2>
              <div className="space-y-1 sm:space-y-1.5">
                {topPlayers.map((player) => (
                  <div
                    key={player.id}
                    className={`flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 md:p-2 rounded-md ${
                      player.rank === 1 ? 'bg-transparent border border-red-600/30' :
                      player.rank === 2 ? 'bg-transparent border border-red-700/20' :
                      player.rank === 3 ? 'bg-transparent border border-red-700/20' :
                      'bg-transparent border border-red-800/20'
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-bold w-5 sm:w-6 flex-shrink-0">
                      {player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : player.rank === 3 ? '🥉' : `${player.rank}º`}
                    </div>
                    <img
                      src={getImageUrl(player.profileImage)}
                      alt={player.nickname}
                      className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full flex-shrink-0 object-cover"
                      onError={(e) => {
                        e.currentTarget.src = '/images/default.png';
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[10px] sm:text-xs md:text-sm truncate text-white">{player.clanTag ? `|${player.clanTag}|` : ''} {player.nickname?.substring(0, 10)}</div>
                      <div className="text-[9px] sm:text-[10px] md:text-xs text-white/80">Score: {player.score || 0}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate('/ranking')}
                className="mt-1.5 sm:mt-2 w-full bg-transparent border border-red-600/50 hover:border-red-500 text-white font-semibold py-1.5 text-xs rounded-md transition-all"
              >
                Ver Mais
              </button>
            </motion.div>
          </div>

          {/* Top 5 Clãs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-lg p-2 sm:p-3 md:p-4 border border-blue-700/30 hover:border-red-600/50 transition-all duration-300"
          >
            <h2 className="text-xs sm:text-sm font-bold mb-1.5 sm:mb-2 flex items-center gap-1 text-white drop-shadow-lg">
              ⚔️ Top 5 Clãs
            </h2>
            <div className="space-y-1 sm:space-y-1.5">
              {topClans.map((clan) => {
                const canJoin = !user?.group && !user?.clanTag;
                return (
                  <motion.div
                    key={clan.id}
                    onClick={() => navigate(`/groups/${clan.id}`)}
                    whileHover={{ scale: 1.02, x: 4 }}
                    className={`flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 md:p-2 rounded-md cursor-pointer transition-all duration-200 ${
                      clan.rank === 1 ? 'bg-transparent border border-blue-600/30 shadow-lg' :
                      clan.rank === 2 ? 'bg-transparent border border-blue-700/20 shadow-md' :
                      clan.rank === 3 ? 'bg-transparent border border-red-700/20 shadow-md' :
                      'bg-transparent border border-blue-800/20 hover:border-red-800/30'
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-bold w-5 sm:w-6 flex-shrink-0">
                      {clan.rank === 1 ? '🥇' : clan.rank === 2 ? '🥈' : clan.rank === 3 ? '🥉' : `${clan.rank}º`}
                    </div>
                    <img
                      src={getImageUrl(clan.logo)}
                      alt={clan.name}
                      className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded object-cover flex-shrink-0 border border-blue-600/50"
                      onError={(e) => {
                        e.currentTarget.src = '/images/default.png';
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[10px] sm:text-xs md:text-sm truncate text-white">[{clan.tag}] {clan.name}</div>
                      <div className="text-[9px] sm:text-[10px] md:text-xs text-white/80">{clan.totalScore || 0} · {clan.memberCount || 0} memb.</div>
                    </div>
                    {canJoin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleJoinGroup(clan.id);
                        }}
                        className="px-1.5 sm:px-2 py-1 bg-transparent border border-blue-600/50 hover:border-red-600/50 text-white rounded text-[10px] sm:text-xs font-semibold whitespace-nowrap"
                      >
                        Entrar
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
            <button
              onClick={() => navigate('/groups')}
              className="mt-1.5 sm:mt-2 w-full bg-transparent border border-blue-700/50 hover:border-red-600/50 text-white font-semibold py-1.5 text-xs rounded-md transition-all"
            >
              Ver Todos os Clãs
            </button>
          </motion.div>
        </div>

        {/* Coluna Central - Notícias e Cartas */}
        <div className="lg:col-span-8 space-y-2 sm:space-y-3 min-w-0">
          {/* Notícias */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-transparent backdrop-blur-sm rounded-lg p-2 sm:p-3 md:p-4 border border-blue-700/30"
          >
            <h2 className="text-base sm:text-lg md:text-xl font-bold mb-2 sm:mb-3 flex items-center gap-1.5 text-white drop-shadow-lg">
              📰 Últimas Notícias
            </h2>
            <div className="space-y-2 sm:space-y-3 max-h-[260px] sm:max-h-[340px] md:max-h-[420px] overflow-y-auto custom-scrollbar">
              {news.length > 0 ? (
                news.map((item) => {
                  // Limitar o conteúdo a um preview (primeiras 150 caracteres)
                  const preview = item.content.length > 150 
                    ? item.content.substring(0, 150) + '...' 
                    : item.content;

                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ scale: 1.01, x: 4 }}
                      onClick={() => navigate(`/news/${item.id}`)}
                      className={`rounded-lg p-2 sm:p-3 border-l-4 transition-all duration-200 cursor-pointer ${
                        item.isPinned
                          ? 'bg-transparent border-blue-500/30 shadow-md'
                          : 'bg-transparent border-blue-600/20 shadow-sm hover:border-red-600/30'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 sm:mb-1.5 flex-wrap">
                        {item.isPinned && <span className="text-white text-[10px] sm:text-xs font-bold">📌 FIXADO</span>}
                        {item.isNew && (
                          <span className="px-1.5 py-0.5 bg-red-600/80 text-white text-[10px] font-bold rounded animate-pulse">NEW</span>
                        )}
                        <span className="text-white/60 text-[10px] sm:text-xs ml-auto">{new Date(item.createdAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <h3 className="text-sm sm:text-base md:text-lg font-bold text-white leading-tight mb-1 line-clamp-2">{item.title}</h3>
                      <p className="text-white/90 text-[11px] sm:text-xs md:text-sm mb-1.5 line-clamp-2">{preview}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] sm:text-xs text-white/60 truncate max-w-[60%]">
                          {item.author?.clanTag ? `|${item.author.clanTag}| ` : ''}{item.author?.nickname || 'Admin'}
                        </span>
                        <span className="text-[10px] sm:text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0">Ler mais →</span>
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="text-center text-white/70 py-4 sm:py-6 text-xs sm:text-sm">
                  Nenhuma notícia disponível
                </div>
              )}
            </div>
          </motion.div>

          <LatestCardsMarquee cards={shopCards} showVerLoja />
        </div>
      </div>
    </div>
  );
}
