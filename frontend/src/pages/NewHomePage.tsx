import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { motion } from 'framer-motion';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { logger } from '../utils/logger';
import LatestCardsMarquee from '../components/LatestCardsMarquee';

import { getImageUrl } from '../utils/imageUrl';
import { formatScore } from '../utils/formatScore';

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
  const [topClansGeneral, setTopClansGeneral] = useState<Clan[]>([]);
  const [topClansSeason, setTopClansSeason] = useState<Clan[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [shopCards, setShopCards] = useState<Card[]>([]);
  const [viewedNewsIds, setViewedNewsIds] = useState<string[]>([]);
  const [selectedNewsModal, setSelectedNewsModal] = useState<News | null>(null);
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

  // Fechar modal da notícia com Escape
  useEffect(() => {
    if (!selectedNewsModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedNewsModal(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNewsModal]);

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
      const [playersRes, seasonPlayersRes, clansGeneralRes, clansSeasonRes, newsRes, cardsRes, nextArenaRes] = await Promise.all([
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
          axios.get(`${API_URL}/groups/ranking/general`, { headers, timeout: 20000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
        ]).catch(err => {
          logger.warn('Erro ao buscar top clãs geral:', err.message);
          return { data: [] };
        }),
        Promise.race([
          axios.get(`${API_URL}/groups/ranking/season`, { headers, timeout: 20000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
        ]).catch(err => {
          logger.warn('Erro ao buscar top clãs season:', err.message);
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
      
      if (clansGeneralRes.data && Array.isArray(clansGeneralRes.data)) {
        setTopClansGeneral(clansGeneralRes.data.slice(0, 5));
      } else {
        setTopClansGeneral([]);
      }
      if (clansSeasonRes.data && Array.isArray(clansSeasonRes.data)) {
        setTopClansSeason(clansSeasonRes.data.slice(0, 5));
      } else {
        setTopClansSeason([]);
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
              className="rounded-lg p-2 sm:p-2.5 border border-amber-500/40 bg-gradient-to-r from-amber-900/30 to-orange-900/30 hover:border-amber-400/60 transition-all cursor-pointer"
            >
              <h2 className="text-[10px] sm:text-xs font-bold mb-0.5 flex items-center gap-1 text-amber-200 drop-shadow-lg">
                ⏰ Próxima Arena
              </h2>
              <p className="text-white font-medium text-[10px] sm:text-xs truncate mb-0.5">{nextArena.name}</p>
              <div className="text-base sm:text-lg font-bold text-amber-300 tabular-nums mb-0.5">
                {timeUntilNextArena > 0 ? formatTimeRemaining(timeUntilNextArena) : '0:00:00'}
              </div>
              <p className="text-white/70 text-[9px] sm:text-[10px] mb-0.5">
                Início: {new Date(nextArena.startTime).toLocaleString('pt-BR')}
              </p>
              <span className="text-amber-400 text-[10px] font-semibold hover:text-amber-300">Ir para Arena →</span>
            </motion.div>
          )}

          {/* Card único: Top 5 Duelistas (Geral + Season lado a lado, igual ao login) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg p-2 sm:p-3 md:p-4 border border-white/20 bg-black/20 backdrop-blur-sm overflow-hidden"
          >
            <div className="px-2 sm:px-3 py-2 border-b border-white/10 bg-gradient-to-r from-amber-500/20 to-transparent mb-2 sm:mb-3">
              <h2 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1">
                <span className="text-base sm:text-lg">🏆</span> Top 5 Duelistas
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 min-h-[140px]">
              {/* Coluna Geral */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-amber-400/90 font-semibold mb-1.5 sm:mb-2">Geral</p>
                {topPlayers.length === 0 ? (
                  <p className="text-white/40 text-xs">Carregando...</p>
                ) : (
                  <ul className="space-y-1 sm:space-y-1.5">
                    {topPlayers.map((p, i) => (
                      <li key={p.id} className="flex items-center gap-1.5 sm:gap-2">
                        <span className="text-white/80 text-xs w-5 shrink-0">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}</span>
                        <Link to={`/profile/${p.id}`} className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 rounded-md p-0.5 -m-0.5 hover:bg-white/10 transition-colors cursor-pointer">
                          <img src={getImageUrl(p.profileImage)} alt="" className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover shrink-0 ring-1 ring-white/20" onError={(e) => { (e.target as HTMLImageElement).src = '/images/default.png'; }} />
                          <div className="min-w-0 flex-1">
                            <span className="text-white text-[10px] sm:text-xs font-medium truncate block hover:text-amber-200">{p.clanTag ? `|${p.clanTag}| ` : ''}{p.nickname || '—'}</span>
                            <span className="text-amber-300/90 text-[9px] sm:text-[10px]">{formatScore(p.score)} pts</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {/* Coluna Season */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-purple-400/90 font-semibold mb-1.5 sm:mb-2">Season</p>
                {topSeasonPlayers.length === 0 ? (
                  <p className="text-white/40 text-xs">Carregando...</p>
                ) : (
                  <ul className="space-y-1 sm:space-y-1.5">
                    {topSeasonPlayers.map((p, i) => (
                      <li key={p.id} className="flex items-center gap-1.5 sm:gap-2">
                        <span className="text-white/80 text-xs w-5 shrink-0">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}</span>
                        <Link to={`/profile/${p.id}`} className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 rounded-md p-0.5 -m-0.5 hover:bg-white/10 transition-colors cursor-pointer">
                          <img src={getImageUrl(p.profileImage)} alt="" className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover shrink-0 ring-1 ring-white/20" onError={(e) => { (e.target as HTMLImageElement).src = '/images/default.png'; }} />
                          <div className="min-w-0 flex-1">
                            <span className="text-white text-[10px] sm:text-xs font-medium truncate block hover:text-purple-200">{p.clanTag ? `|${p.clanTag}| ` : ''}{p.nickname || '—'}</span>
                            <span className="text-purple-300/90 text-[9px] sm:text-[10px]">{formatScore(p.score)} pts</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <button
              onClick={() => navigate('/ranking')}
              className="mt-2 sm:mt-3 w-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold py-1.5 text-xs rounded-md transition-all"
            >
              Ver ranking completo
            </button>
          </motion.div>

          {/* Card único: Top 5 Clãs (Geral + Season lado a lado, igual ao login) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-lg p-2 sm:p-3 md:p-4 border border-white/20 bg-black/20 backdrop-blur-sm overflow-hidden"
          >
            <div className="px-2 sm:px-3 py-2 border-b border-white/10 bg-gradient-to-r from-rose-500/20 to-transparent mb-2 sm:mb-3">
              <h2 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1">
                <span className="text-base sm:text-lg">⚔️</span> Top 5 Clãs
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 min-h-[140px]">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-amber-400/90 font-semibold mb-1.5 sm:mb-2">Geral</p>
                {topClansGeneral.length === 0 ? (
                  <p className="text-white/40 text-xs">Carregando...</p>
                ) : (
                  <ul className="space-y-1 sm:space-y-1.5">
                    {topClansGeneral.map((c, i) => (
                      <li
                        key={c.id}
                        onClick={() => navigate(`/groups/${c.id}`)}
                        className="flex items-center gap-1.5 sm:gap-2 cursor-pointer rounded-md p-1 hover:bg-white/5 transition-colors"
                      >
                        <span className="text-white/80 text-xs w-5 shrink-0">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}</span>
                        <img src={getImageUrl(c.logo)} alt="" className="w-6 h-6 sm:w-7 sm:h-7 rounded object-cover shrink-0 ring-1 ring-white/20" onError={(e) => { (e.target as HTMLImageElement).src = '/images/default.png'; }} />
                        <div className="min-w-0 flex-1">
                          <span className="text-white text-[10px] sm:text-xs font-medium truncate block">[{c.tag}] {c.name || '—'}</span>
                          <span className="text-amber-300/90 text-[9px] sm:text-[10px]">{formatScore(c.totalScore)} pts</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-purple-400/90 font-semibold mb-1.5 sm:mb-2">Season</p>
                {topClansSeason.length === 0 ? (
                  <p className="text-white/40 text-xs">Carregando...</p>
                ) : (
                  <ul className="space-y-1 sm:space-y-1.5">
                    {topClansSeason.map((c, i) => (
                      <li
                        key={c.id}
                        onClick={() => navigate(`/groups/${c.id}`)}
                        className="flex items-center gap-1.5 sm:gap-2 cursor-pointer rounded-md p-1 hover:bg-white/5 transition-colors"
                      >
                        <span className="text-white/80 text-xs w-5 shrink-0">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}</span>
                        <img src={getImageUrl(c.logo)} alt="" className="w-6 h-6 sm:w-7 sm:h-7 rounded object-cover shrink-0 ring-1 ring-white/20" onError={(e) => { (e.target as HTMLImageElement).src = '/images/default.png'; }} />
                        <div className="min-w-0 flex-1">
                          <span className="text-white text-[10px] sm:text-xs font-medium truncate block">[{c.tag}] {c.name || '—'}</span>
                          <span className="text-purple-300/90 text-[9px] sm:text-[10px]">{formatScore(c.totalScore)} pts</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <button
              onClick={() => navigate('/groups')}
              className="mt-2 sm:mt-3 w-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold py-1.5 text-xs rounded-md transition-all"
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
                      onClick={() => setSelectedNewsModal(item)}
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
                        <span className="text-[10px] sm:text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0">Abrir →</span>
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

      {/* Modal da notícia */}
      {selectedNewsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setSelectedNewsModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="news-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl border border-blue-600/40 bg-gradient-to-b from-slate-900/95 to-slate-800/95 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-y-auto max-h-[90vh] custom-scrollbar p-4 sm:p-6">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  {selectedNewsModal.isPinned && (
                    <span className="text-white text-xs font-bold shrink-0">📌 FIXADO</span>
                  )}
                  {selectedNewsModal.isNew && (
                    <span className="px-2 py-0.5 bg-red-600/80 text-white text-xs font-bold rounded animate-pulse shrink-0">NEW</span>
                  )}
                  <span className="text-white/60 text-xs shrink-0">
                    {new Date(selectedNewsModal.createdAt).toLocaleDateString('pt-BR', { dateStyle: 'medium' })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedNewsModal(null)}
                  className="shrink-0 p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Fechar"
                >
                  <span className="text-xl leading-none">×</span>
                </button>
              </div>
              <h2 id="news-modal-title" className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-2 pr-8">
                {selectedNewsModal.title}
              </h2>
              <p className="text-white/70 text-xs sm:text-sm mb-4">
                {selectedNewsModal.author?.clanTag ? `|${selectedNewsModal.author.clanTag}| ` : ''}
                {selectedNewsModal.author?.nickname || 'Admin'}
              </p>
              {selectedNewsModal.image && (
                <div className="rounded-lg overflow-hidden mb-4 border border-white/10">
                  <img
                    src={getImageUrl(selectedNewsModal.image)}
                    alt=""
                    className="w-full h-auto object-cover max-h-[320px]"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
              <div className="text-white/90 text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
                {selectedNewsModal.content}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
