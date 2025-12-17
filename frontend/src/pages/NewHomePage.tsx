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

  // Estados
  const [topPlayers, setTopPlayers] = useState<RankingPlayer[]>([]);
  const [topSeasonPlayers, setTopSeasonPlayers] = useState<RankingPlayer[]>([]);
  const [topClans, setTopClans] = useState<Clan[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [latestCards, setLatestCards] = useState<Card[]>([]);
  
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
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  useEffect(() => {
    // Buscar dados mesmo sem token (endpoints são públicos)
    fetchData();
  }, []);

  // Auto-play do carrossel - passa uma carta por vez
  useEffect(() => {
    if (latestCards.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentCardIndex((prev) => (prev === latestCards.length - 1 ? 0 : prev + 1));
    }, 4000); // Muda a cada 4 segundos

    return () => clearInterval(interval);
  }, [latestCards.length]);

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
      const [playersRes, seasonPlayersRes, clansRes, newsRes, cardsRes] = await Promise.all([
        Promise.race([
          axios.get(`${API_URL}/users/ranking/general`, { headers, timeout: 20000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
        ]).catch(err => {
          console.warn('⚠️ Erro ao buscar ranking geral:', err.message);
          return { data: [] };
        }),
        Promise.race([
          axios.get(`${API_URL}/users/ranking/season`, { headers, timeout: 20000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
        ]).catch(err => {
          console.warn('⚠️ Erro ao buscar top season players:', err.message);
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
        Promise.race([
          axios.get(`${API_URL}/cards/shop/for-sale`, { headers, timeout: 20000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
        ]).catch(err => {
          console.error('❌ [NewHomePage] Erro ao buscar últimas cartas:', err);
          console.error('❌ [NewHomePage] Detalhes do erro:', err.response?.data || err.message);
          return { data: [] };
        }),
      ]);

      console.log('✅ [NewHomePage] Top players recebidos:', playersRes.data);
      console.log('✅ [NewHomePage] Top season players recebidos:', seasonPlayersRes.data);
      console.log('✅ [NewHomePage] Top clãs recebidos:', clansRes.data);
      console.log('✅ [NewHomePage] Notícias recebidas:', newsRes.data);
      
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
        console.warn('⚠️ [NewHomePage] Ranking geral não é um array:', playersRes.data);
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
        console.warn('⚠️ [NewHomePage] Top season players não é um array:', seasonPlayersRes.data);
        setTopSeasonPlayers([]);
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
      
      console.log('✅ [NewHomePage] Cartas recebidas:', cardsRes.data);
      if (cardsRes.data && Array.isArray(cardsRes.data)) {
        // Ordenar por data de criação (mais recentes primeiro) e pegar apenas as 10 primeiras
        const sortedCards = [...cardsRes.data]
          .sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA; // Mais recentes primeiro
          })
          .slice(0, 10);
        console.log('✅ [NewHomePage] Total de cartas ordenadas:', sortedCards.length);
        setLatestCards(sortedCards);
      } else {
        console.warn('⚠️ [NewHomePage] Cartas não é um array:', cardsRes.data);
        setLatestCards([]);
      }
    } catch (error: any) {
      console.error('❌ [NewHomePage] Erro ao buscar dados:', error);
      console.error('❌ [NewHomePage] Detalhes:', error.response?.data || error.message);
      // Definir arrays vazios em caso de erro
      setTopPlayers([]);
      setTopSeasonPlayers([]);
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
    <div className="max-w-7xl mx-auto pl-2 sm:pl-4 pr-2 sm:pr-4 py-4">
      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4">
        {/* Coluna Esquerda - Rankings */}
        <div className="lg:col-span-5 space-y-3 md:space-y-4 -ml-2 sm:ml-0">
          {/* Top 5 Rankings - Layout lado a lado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
            {/* Top 5 Season */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl p-3 md:p-5 border border-blue-700/30 hover:border-blue-600/50 transition-all duration-300"
            >
              <h2 className="text-sm md:text-base font-bold mb-2 md:mb-3 flex items-center gap-1 text-white drop-shadow-lg">
                🏆 Top 5 Season
              </h2>
              <div className="space-y-1.5 md:space-y-2">
                {topSeasonPlayers.map((player) => (
                  <motion.div
                    key={player.id}
                    whileHover={{ scale: 1.02, x: 4 }}
                    className={`flex items-center gap-2 md:gap-3 p-1.5 md:p-2 rounded-lg transition-all duration-200 ${
                      player.rank === 1 ? 'bg-transparent border border-blue-600/30 shadow-lg' :
                      player.rank === 2 ? 'bg-transparent border border-blue-700/20 shadow-md' :
                      player.rank === 3 ? 'bg-transparent border border-blue-700/20 shadow-md' :
                      'bg-transparent border border-blue-800/20 hover:border-blue-700/30'
                    }`}
                  >
                    <div className="text-sm md:text-base font-bold w-5 md:w-6 flex-shrink-0">
                      {player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : player.rank === 3 ? '🥉' : `${player.rank}º`}
                    </div>
                    <img 
                      src={player.profileImage ? `http://localhost:3000${player.profileImage}` : '/images/default.png'}
                      alt={player.nickname}
                      className="w-7 h-7 md:w-9 md:h-9 rounded-full flex-shrink-0"
                      onError={(e) => {
                        e.currentTarget.src = '/images/default.png';
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs md:text-sm truncate text-white">{player.clanTag ? `|${player.clanTag}|` : ''} {player.nickname?.substring(0, 10)}</div>
                      <div className="text-[10px] md:text-xs text-white/80">
                        Score: {player.score || 0}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
              <button
                onClick={() => navigate('/ranking')}
                className="mt-2 md:mt-3 w-full bg-transparent border-2 border-blue-600/50 hover:border-blue-500 text-white font-bold py-1.5 md:py-2 text-xs md:text-sm rounded-lg transition-all duration-300 hover:scale-105"
              >
                Ver Mais
              </button>
            </motion.div>

            {/* Top 5 Geral */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-xl p-3 md:p-5 border border-red-700/30 hover:border-red-600/50 transition-all duration-300"
            >
              <h2 className="text-sm md:text-base font-bold mb-2 md:mb-3 flex items-center gap-1 text-white drop-shadow-lg">
                ⭐ Top 5 Geral
              </h2>
              <div className="space-y-1.5 md:space-y-2">
                {topPlayers.map((player) => (
                  <div
                    key={player.id}
                    className={`flex items-center gap-2 md:gap-3 p-1.5 md:p-2 rounded ${
                      player.rank === 1 ? 'bg-transparent border border-red-600/30' :
                      player.rank === 2 ? 'bg-transparent border border-red-700/20' :
                      player.rank === 3 ? 'bg-transparent border border-red-700/20' :
                      'bg-transparent border border-red-800/20'
                    }`}
                  >
                    <div className="text-sm md:text-base font-bold w-5 md:w-6 flex-shrink-0">
                      {player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : player.rank === 3 ? '🥉' : `${player.rank}º`}
                    </div>
                    <img 
                      src={player.profileImage ? `http://localhost:3000${player.profileImage}` : '/images/default.png'}
                      alt={player.nickname}
                      className="w-7 h-7 md:w-9 md:h-9 rounded-full flex-shrink-0"
                      onError={(e) => {
                        e.currentTarget.src = '/images/default.png';
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs md:text-sm truncate text-white">{player.clanTag ? `|${player.clanTag}|` : ''} {player.nickname?.substring(0, 10)}</div>
                      <div className="text-[10px] md:text-xs text-white/80">
                        Score: {player.score || 0}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate('/ranking')}
                className="mt-2 md:mt-3 w-full bg-transparent border-2 border-red-600/50 hover:border-red-500 text-white font-bold py-1.5 md:py-2 text-xs md:text-sm rounded-lg transition-all duration-300 hover:scale-105"
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
            className="rounded-xl p-3 md:p-5 border border-blue-700/30 hover:border-red-600/50 transition-all duration-300"
          >
            <h2 className="text-lg md:text-xl font-bold mb-2 md:mb-3 flex items-center gap-2 text-white drop-shadow-lg">
              ⚔️ Top 5 Clãs
            </h2>
            <div className="space-y-1.5 md:space-y-2">
              {topClans.map((clan) => {
                const canJoin = !user?.group && !user?.clanTag;
                
                return (
                  <motion.div
                    key={clan.id}
                    onClick={() => navigate(`/groups/${clan.id}`)}
                    whileHover={{ scale: 1.02, x: 4 }}
                    className={`flex items-center gap-2 md:gap-3 p-2 md:p-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
                      clan.rank === 1 ? 'bg-transparent border border-blue-600/30 shadow-lg' :
                      clan.rank === 2 ? 'bg-transparent border border-blue-700/20 shadow-md' :
                      clan.rank === 3 ? 'bg-transparent border border-red-700/20 shadow-md' :
                      'bg-transparent border border-blue-800/20 hover:border-red-800/30'
                    }`}
                  >
                    <div className="text-base md:text-lg font-bold w-6 md:w-7 flex-shrink-0">
                      {clan.rank === 1 ? '🥇' : clan.rank === 2 ? '🥈' : clan.rank === 3 ? '🥉' : `${clan.rank}º`}
                    </div>
                    <img 
                      src={clan.logo ? `${API_URL}${clan.logo}` : '/images/default.png'}
                      alt={clan.name}
                      className="w-8 h-8 md:w-10 md:h-10 rounded-lg object-cover flex-shrink-0 border-2 border-blue-600/50"
                      onError={(e) => {
                        e.currentTarget.src = '/images/default.png';
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm md:text-base truncate text-white">[{clan.tag}] {clan.name}</div>
                      <div className="text-xs md:text-sm text-white/80">
                        Score: {clan.totalScore || 0} | Membros: {clan.memberCount || 0}
                      </div>
                    </div>
                    {canJoin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleJoinGroup(clan.id);
                        }}
                        className="px-2 md:px-3 py-1 md:py-1.5 bg-transparent border-2 border-blue-600/50 hover:border-red-600/50 text-white rounded-lg font-bold transition-colors text-xs md:text-sm whitespace-nowrap"
                      >
                        ✨ Entrar
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
            <button
              onClick={() => navigate('/groups')}
              className="mt-2 md:mt-3 w-full bg-transparent border-2 border-blue-700/50 hover:border-red-600/50 text-white font-bold py-1.5 md:py-2 text-xs md:text-sm rounded-lg transition-all duration-300 hover:scale-105"
            >
              Ver Todos os Clãs
            </button>
          </motion.div>
        </div>

        {/* Coluna Central - Notícias e Cartas */}
        <div className="lg:col-span-7 space-y-3 md:space-y-4">
          {/* Notícias */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-transparent backdrop-blur-sm rounded-xl p-3 md:p-6 border border-blue-700/30"
          >
            <h2 className="text-xl md:text-3xl font-bold mb-3 md:mb-6 flex items-center gap-2 text-white drop-shadow-lg">
              📰 Últimas Notícias
            </h2>
            <div className="space-y-3 md:space-y-4 max-h-[400px] md:max-h-[600px] overflow-y-auto custom-scrollbar">
              {news.length > 0 ? (
                news.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ scale: 1.01, x: 4 }}
                    className={`rounded-xl p-3 md:p-4 border-l-4 transition-all duration-200 ${
                      item.isPinned 
                        ? 'bg-transparent border-blue-500/30 shadow-lg' 
                        : 'bg-transparent border-blue-600/20 shadow-md hover:border-red-600/30'
                    }`}
                  >
                    {item.isPinned && (
                      <div className="text-white text-xs md:text-sm font-bold mb-1">📌 FIXADO</div>
                    )}
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-0 mb-2">
                      <h3 className="text-base md:text-xl font-bold text-white">{item.title}</h3>
                      <span className="text-white/70 text-xs md:text-sm">
                        {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <p className="text-white/90 text-sm md:text-base mb-2">{item.content}</p>
                    <div className="text-xs md:text-sm text-white/70">
                      Por: {item.author?.clanTag ? `|${item.author.clanTag}| ${item.author?.nickname || 'Admin'}` : (item.author?.nickname || 'Admin')}
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-center text-white/70 py-8 text-sm md:text-base">
                  Nenhuma notícia disponível
                </div>
              )}
            </div>
          </motion.div>

          {/* Carrossel de Últimas Cartas - Contínuo */}
          {latestCards.length > 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="relative"
            >
              <div className="flex items-center justify-center gap-1 mb-2">
                <h2 className="text-xs md:text-sm font-semibold flex items-center gap-1 text-white/80">
                  <span className="text-sm">🎴</span>
                  <span>Novas Cartas</span>
                </h2>
                {latestCards.length > 1 && (
                  <div className="flex gap-1">
                    {latestCards.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentCardIndex(index)}
                        className={`h-1 rounded-full transition-all duration-300 ${
                          index === currentCardIndex
                            ? 'bg-blue-400 w-4 shadow-sm'
                            : 'bg-red-600/50 hover:bg-red-500/70 w-1'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
              
              <div className="relative overflow-hidden rounded-md">
                <div className="flex transition-transform duration-700 ease-in-out" style={{ transform: `translateX(-${currentCardIndex * 100}%)` }}>
                  {latestCards.map((card, index) => (
                    <motion.div
                      key={card.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className="min-w-full flex-shrink-0 flex justify-center"
                    >
                      <div className="relative w-20 h-28 md:w-24 md:h-36">
                        <img
                          src={card.cardImage ? `${API_URL}${card.cardImage}` : '/images/fundoCarta.webp'}
                          alt={card.name}
                          className="w-full h-full object-cover rounded-md border-2 border-blue-600/40 shadow-lg hover:shadow-red-500/40 transition-all duration-300 hover:scale-105 cursor-pointer"
                          onError={(e) => {
                            e.currentTarget.src = '/images/fundoCarta.webp';
                          }}
                        />
                        {card.rarity && (
                          <div className="absolute -top-1 -right-1 bg-gradient-to-r from-blue-600 to-red-600 text-white text-[8px] font-bold px-1 py-0.5 rounded-full shadow-md border border-blue-500/50">
                            {card.rarity.charAt(0)}
                          </div>
                        )}
                        {/* Tooltip com informações */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-1.5 rounded-b-md">
                          <h3 className="text-[10px] font-bold text-white truncate drop-shadow-sm">
                            {card.name}
                          </h3>
                          <p className="text-[8px] text-blue-300/80 truncate">
                            {card.type}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
                
                {/* Botões de navegação nas laterais */}
                {latestCards.length > 1 && (
                  <>
                    <button
                      onClick={() => setCurrentCardIndex((prev) => (prev === 0 ? latestCards.length - 1 : prev - 1))}
                      className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 flex items-center justify-center bg-blue-800/90 hover:bg-blue-700/90 backdrop-blur-sm rounded-full border border-blue-600/40 shadow-lg hover:shadow-blue-500/50 transition-all duration-300 text-white text-sm font-bold z-10 hover:scale-110"
                    >
                      ←
                    </button>
                    <button
                      onClick={() => setCurrentCardIndex((prev) => (prev === latestCards.length - 1 ? 0 : prev + 1))}
                      className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-8 h-8 flex items-center justify-center bg-red-800/90 hover:bg-red-700/90 backdrop-blur-sm rounded-full border border-red-600/40 shadow-lg hover:shadow-red-500/50 transition-all duration-300 text-white text-sm font-bold z-10 hover:scale-110"
                    >
                      →
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-center py-4"
            >
              <h2 className="text-xs md:text-sm font-semibold mb-2 flex items-center justify-center gap-1 text-white/80">
                <span className="text-sm">🎴</span>
                <span>Novas Cartas</span>
              </h2>
              <div className="text-white/70 text-xs">
                Nenhuma carta cadastrada ainda
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
