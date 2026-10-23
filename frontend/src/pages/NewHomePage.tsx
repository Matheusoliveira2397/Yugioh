import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { logger } from '../utils/logger';
import LatestCardsMarquee from '../components/LatestCardsMarquee';
import GameIcon from '../components/GameIcon';
import './NewHomePage.css';

import { getImageUrl, getProfileImageUrl, DEFAULT_PROFILE_IMAGE_PATH } from '../utils/imageUrl';
import { formatScore } from '../utils/formatScore';
import { useI18n } from '../i18n/I18nContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const HOME_QUICK_ACTIONS = [
  {
    to: '/random-duel',
    label: 'Duelo',
    hint: 'Encontre um oponente',
  },
  {
    to: '/arena',
    label: 'Arena',
    hint: 'Desafios agendados',
  },
  {
    to: '/shop',
    label: 'Loja',
    hint: 'Cartas e cosméticos',
  },
  {
    to: '/ranking',
    label: 'Ranking',
    hint: 'Top duelistas',
  },
  {
    to: '/tournaments',
    label: 'Torneios',
    hint: 'Competições oficiais',
  },
  {
    to: '/groups',
    label: 'Clãs',
    hint: 'Jogue em equipe',
  },
] as const;

const HOME_SECONDARY_ACTIONS = [
  { to: '/collection', label: 'Coleção' },
  { to: '/loot-boxes', label: 'Pacotes' },
  { to: '/deck-builder', label: 'Decks' },
  { to: '/credit', label: 'Créditos' },
] as const;

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

interface PublicStats {
  currentSeasonNumber: number;
  seasonEndsAt: string | null;
  seasonEndsInDays: number | null;
  totalDuelists: number;
  totalDuels: number;
  tournamentsFinished: number;
  cardsRegistered: number;
  playersOnline: number;
  maxOnlineToday: number;
  maxOnlineYesterday: number;
}

export default function HomePage() {
  const { t } = useI18n();
  const { token, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Estados
  const [loading, setLoading] = useState(false);
  const [topPlayers, setTopPlayers] = useState<RankingPlayer[]>([]);
  const [topSeasonPlayers, setTopSeasonPlayers] = useState<RankingPlayer[]>([]);
  const [topClansGeneral, setTopClansGeneral] = useState<Clan[]>([]);
  const [topClansSeason, setTopClansSeason] = useState<Clan[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [shopCards, setShopCards] = useState<Card[]>([]);
  const [, setViewedNewsIds] = useState<string[]>([]);
  const [selectedNewsModal, setSelectedNewsModal] = useState<News | null>(null);
  const [newsIndex, setNewsIndex] = useState(0);
  const [newsPaused, setNewsPaused] = useState(false);
  const newsDirection = useRef(1);
  const [nextArena, setNextArena] = useState<{ name: string; startTime: string } | null>(null);
  const [timeUntilNextArena, setTimeUntilNextArena] = useState<number>(0);
  const [publicStats, setPublicStats] = useState<PublicStats | null>(null);
  
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

  // Carrossel de notícias: uma por vez, rolagem automática
  useEffect(() => {
    if (news.length <= 1 || newsPaused || selectedNewsModal) return;
    const timer = setInterval(() => {
      newsDirection.current = 1;
      setNewsIndex((prev) => (prev + 1) % news.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [news.length, newsPaused, selectedNewsModal]);

  useEffect(() => {
    if (newsIndex >= news.length && news.length > 0) {
      setNewsIndex(0);
    }
  }, [news.length, newsIndex]);

  const goToNews = (next: number) => {
    if (news.length === 0) return;
    newsDirection.current = next > newsIndex || (newsIndex === news.length - 1 && next === 0) ? 1 : -1;
    setNewsIndex(((next % news.length) + news.length) % news.length);
  };

  const fetchData = async () => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const softGet = <T,>(p: Promise<T>, fallback: T, ms = 12000): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
      ]).catch(() => fallback);

    try {
      setLoading(true);

      // Fase 1 — crítico: libera a home sem esperar todos os endpoints
      const [nextArenaRes, newsRes, playersRes] = await Promise.all([
        softGet(axios.get(`${API_URL}/arena/next`, { headers, timeout: 8000 }), { data: null } as any, 8000),
        softGet(axios.get(`${API_URL}/news/latest?limit=6`, { headers, timeout: 10000 }), { data: [] } as any, 10000),
        softGet(axios.get(`${API_URL}/users/ranking/general?limit=5`, { headers, timeout: 10000 }), { data: [] } as any, 10000),
      ]);

      if (Array.isArray(playersRes?.data)) {
        setTopPlayers(
          playersRes.data.slice(0, 5).map((player: any, index: number) => ({
            ...player,
            rank: index + 1,
            score: player.totalScore || player.score || 0,
            wins: player.winsGeral || player.wins || 0,
            losses: player.lossesGeral || player.losses || 0,
          })),
        );
      }

      if (Array.isArray(newsRes?.data)) {
        setNews(newsRes.data.map((item: News) => ({ ...item, isNew: true })));
      }

      if (nextArenaRes?.data?.arena) {
        const startTime = nextArenaRes.data.arena.startTime;
        const until =
          nextArenaRes.data.timeUntilStart ?? new Date(startTime).getTime() - Date.now();
        setNextArena({ name: nextArenaRes.data.arena.name, startTime });
        setTimeUntilNextArena(Math.max(0, until));
      } else {
        setNextArena(null);
        setTimeUntilNextArena(0);
      }
    } catch (error: any) {
      logger.error('Erro ao buscar dados críticos da home:', error?.message || error);
    } finally {
      setLoading(false);
    }

    // Fase 2 — secundário (não bloqueia o primeiro paint)
    try {
      let viewedIds: string[] = [];
      if (token && user) {
        try {
          const viewedResponse = await axios.get(`${API_URL}/news/views/user`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 8000,
          });
          viewedIds = viewedResponse.data || [];
          setViewedNewsIds(viewedIds);
        } catch (error) {
          logger.error('Erro ao buscar notícias vistas:', error);
        }
      }

      const [seasonPlayersRes, clansGeneralRes, clansSeasonRes, cardsRes, statsRes] = await Promise.all([
        softGet(axios.get(`${API_URL}/users/ranking/top5`, { headers, timeout: 10000 }), { data: [] } as any, 10000),
        softGet(axios.get(`${API_URL}/groups/ranking/top5`, { headers, timeout: 10000 }), { data: [] } as any, 10000),
        softGet(axios.get(`${API_URL}/groups/ranking/season?limit=5`, { headers, timeout: 10000 }), { data: [] } as any, 10000),
        softGet(axios.get(`${API_URL}/cards/shop/for-sale?limit=10&lite=1`, { headers, timeout: 8000 }), { data: [] } as any, 8000),
        softGet(axios.get(`${API_URL}/public/stats`, { headers, timeout: 10000 }), { data: null } as any, 10000),
      ]);

      if (Array.isArray(seasonPlayersRes?.data)) {
        setTopSeasonPlayers(
          seasonPlayersRes.data.slice(0, 5).map((player: any, index: number) => ({
            ...player,
            rank: index + 1,
            score: player.seasonScore || player.score || 0,
          })),
        );
      }

      setTopClansGeneral(Array.isArray(clansGeneralRes?.data) ? clansGeneralRes.data.slice(0, 5) : []);
      setTopClansSeason(Array.isArray(clansSeasonRes?.data) ? clansSeasonRes.data.slice(0, 5) : []);

      setNews((prev) =>
        prev.map((item) => ({
          ...item,
          isNew: !viewedIds.includes(item.id),
        })),
      );

      setShopCards(Array.isArray(cardsRes?.data) ? cardsRes.data.slice(0, 10) : []);

      const st = statsRes?.data;
      if (st && typeof st === 'object' && typeof st.totalDuelists === 'number') {
        setPublicStats(st as PublicStats);
      }
    } catch (error: any) {
      logger.error('Erro ao buscar dados secundários da home:', error?.message || error);
    }
  };


  const formatTimeRemaining = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const homePanel = 'game-panel';

  return (
    <div className="duelist-home w-full min-w-0 px-1.5 sm:px-3 py-2 sm:py-3 pb-6">
      {loading && topPlayers.length === 0 && news.length === 0 && (
        <div className="mb-3 flex items-center gap-2 text-arena-mist text-sm">
          <div className="h-4 w-4 rounded-full border-2 border-champion-gold/30 border-t-champion-gold animate-spin" aria-hidden />
          <span>{t('common.loading')}</span>
        </div>
      )}

      {/* O cenário do jogo permanece visível atrás do portal e de seu menu. */}
      <section className="home-hero relative mb-5 rounded-2xl" aria-labelledby="home-feature-heading">
        <div className="home-hero-content grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(250px,0.75fr)] lg:items-center">
          <div className="min-w-0">
            <p className="home-eyebrow inline-flex items-center gap-2">
              <GameIcon route="/arena" size={23} /> Academia de duelistas
            </p>
            <h2 id="home-feature-heading" className="home-hero-title mt-3 max-w-2xl font-display text-3xl font-extrabold leading-[1.12] sm:text-4xl xl:text-5xl">
              Prepare seu deck. <span className="text-champion-gold">Domine a arena.</span>
            </h2>
            <p className="home-hero-subtitle mt-3 max-w-xl text-sm leading-relaxed sm:text-base">
              Enfrente outros duelistas, construa sua estratégia e avance na sua própria história.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link to="/random-duel" className="home-main-action home-main-action--primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5">
                <GameIcon route="/random-duel" size={22} /> Iniciar duelo <span aria-hidden="true">→</span>
              </Link>
              <Link to="/story" className="home-main-action inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5">
                <GameIcon route="/story" size={22} /> Modo história
              </Link>
            </div>
          </div>
          <nav className="home-preparation self-stretch p-3 sm:p-4" aria-label="Acesso rápido à preparação">
            <p className="home-eyebrow">Sua jornada começa aqui</p>
            <h3 className="mt-1 mb-3 text-lg font-bold text-white">Prepare-se para duelar</h3>
            <div className="grid gap-2">
              {[
                { to: '/deck-builder', title: 'Montar meu deck', description: 'Ajuste sua estratégia' },
                { to: '/collection', title: 'Ver minha coleção', description: 'Explore suas cartas' },
                { to: '/missions', title: 'Concluir missões', description: 'Avance e ganhe recompensas' },
              ].map((item) => (
                <Link key={item.to} to={item.to} className="home-preparation-link group flex min-h-14 items-center gap-3 rounded-lg p-2.5">
                  <span className="home-preparation-icon"><GameIcon route={item.to} size={30} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">{item.title}</span>
                    <span className="block text-xs text-[#e2d3c8]">{item.description}</span>
                  </span>
                  <span aria-hidden="true" className="text-champion-gold transition-transform group-hover:translate-x-1">→</span>
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </section>

      {/* Saudação + hub de ações */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="home-dashboard-intro mb-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <p className="text-xs sm:text-sm uppercase tracking-[0.18em] text-champion-gold/70 font-semibold">
              {t('home.title')}
            </p>
            <h1 className="game-page-title text-2xl sm:text-3xl md:text-4xl !leading-tight">
              {t('home.welcome')}
              {user?.nickname ? (
                <span className="text-champion-gold">, {user.nickname}</span>
              ) : null}
            </h1>
          </div>
          {publicStats && (
            <div className="home-online-counter flex items-center gap-2 rounded-full border border-champion-gold/35 px-3.5 py-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-champion-cyan opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-champion-cyan" />
              </span>
              <span className="text-sm font-semibold text-champion-cyan tabular-nums">
                {publicStats.playersOnline.toLocaleString('pt-BR')} online
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {HOME_QUICK_ACTIONS.map((action, i) => (
            <motion.button
              key={action.to}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => navigate(action.to)}
              className="home-action-tile game-cta-tile ui-action-tile group !p-3 sm:!p-3.5 flex flex-col items-center text-center justify-center min-h-[8rem] sm:min-h-[8.5rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champion-gold"
            >
              <span className="game-screen-icon relative z-10 mb-1 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5">
                <GameIcon route={action.to} size={36} />
              </span>
              <strong className="relative z-10 mt-1.5 block font-display text-xs sm:text-sm text-champion-gold group-hover:text-white transition-colors leading-tight">
                {action.label}
              </strong>
              <span className="relative z-10 mt-1 block text-[11px] text-slate-300 leading-tight line-clamp-2 px-0.5">
                {action.hint}
              </span>
            </motion.button>
          ))}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-2">
          {HOME_SECONDARY_ACTIONS.map((action) => (
            <button
              key={action.to}
              type="button"
              onClick={() => navigate(action.to)}
              className="home-secondary-action inline-flex items-center gap-2 rounded-lg border border-champion-gold/30 px-3 py-2 text-xs sm:text-sm font-semibold text-white/90 transition-colors"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center text-champion-gold">
                <GameIcon route={action.to} size={22} />
              </span>
              {action.label}
            </button>
          ))}
        </div>
      </motion.div>
      {/* Bloco principal — preenche até a sidebar do usuário */}
      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-3.5 lg:items-stretch">
        {/* Coluna rankings */}
        <aside className="min-w-0 flex flex-col gap-2.5">
          {nextArena && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => navigate('/arena')}
              className={`${homePanel} px-3.5 py-3 hover:border-champion-gold/55 transition-all cursor-pointer animate-gold-pulse`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="game-panel-title !text-sm flex items-center gap-1.5 text-champion-gold">
                    ⏰ {t('home.nextArena')}
                  </h2>
                  <p className="text-white font-medium text-sm truncate mt-0.5">{nextArena.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl sm:text-2xl font-display font-bold text-champion-gold tabular-nums leading-none">
                    {timeUntilNextArena > 0 ? formatTimeRemaining(timeUntilNextArena) : '0:00:00'}
                  </div>
                  <span className="text-champion-amber text-xs font-semibold">{t('home.goToArena')} →</span>
                </div>
              </div>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${homePanel} flex-1`}
          >
            <div className="game-panel-header !px-3.5 !py-2.5">
              <h2 className="game-panel-title !text-sm flex items-center gap-1.5">
                <span aria-hidden>🏆</span> {t('home.top5Duelists')}
              </h2>
            </div>
            <div className="px-3 py-2.5 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-champion-gold/90 font-semibold mb-1.5">{t('home.general')}</p>
                {topPlayers.length === 0 ? (
                  <p className="text-white/40 text-xs">{t('common.loading')}</p>
                ) : (
                  <ul className="space-y-1">
                    {topPlayers.map((p, i) => (
                      <li key={p.id}>
                        <Link
                          to={`/profile/${p.id}`}
                          className="flex items-center gap-1.5 min-w-0 rounded-md px-1 py-1 hover:bg-champion-gold/10 transition-colors"
                        >
                          <span className="text-white/75 text-xs w-4 shrink-0 text-center">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                          </span>
                          <img
                            src={getProfileImageUrl(p.profileImage)}
                            alt=""
                            className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-champion-gold/30"
                            onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_PROFILE_IMAGE_PATH; }}
                          />
                          <span className="text-white text-xs sm:text-sm font-medium truncate min-w-0 flex-1 hover:text-champion-gold">
                            {p.nickname || '—'}
                          </span>
                          <span className="text-champion-amber text-xs tabular-nums shrink-0">{formatScore(p.score)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-champion-cyan/90 font-semibold mb-1.5">{t('home.season')}</p>
                {topSeasonPlayers.length === 0 ? (
                  <p className="text-white/40 text-xs">{t('common.loading')}</p>
                ) : (
                  <ul className="space-y-1">
                    {topSeasonPlayers.map((p, i) => (
                      <li key={p.id}>
                        <Link
                          to={`/profile/${p.id}`}
                          className="flex items-center gap-1.5 min-w-0 rounded-md px-1 py-1 hover:bg-champion-cyan/10 transition-colors"
                        >
                          <span className="text-white/75 text-xs w-4 shrink-0 text-center">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                          </span>
                          <img
                            src={getProfileImageUrl(p.profileImage)}
                            alt=""
                            className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-champion-cyan/30"
                            onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_PROFILE_IMAGE_PATH; }}
                          />
                          <span className="text-white text-xs sm:text-sm font-medium truncate min-w-0 flex-1 hover:text-champion-cyan">
                            {p.nickname || '—'}
                          </span>
                          <span className="text-champion-cyan/90 text-xs tabular-nums shrink-0">{formatScore(p.score)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="px-3 pb-2.5">
              <button
                type="button"
                onClick={() => navigate('/ranking')}
                className="w-full bg-champion-gold/10 hover:bg-champion-gold/20 border border-champion-gold/25 text-white font-semibold py-1.5 text-xs rounded-md transition-colors"
              >
                {t('home.viewFullRanking')}
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className={`${homePanel} flex-1`}
          >
            <div
              className="game-panel-header !px-3.5 !py-2.5"
              
            >
              <h2 className="game-panel-title !text-sm flex items-center gap-1.5">
                <span aria-hidden>⚔️</span> {t('home.top5Clans')}
              </h2>
            </div>
            <div className="px-3 py-2.5 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-champion-gold/90 font-semibold mb-1.5">{t('home.general')}</p>
                {topClansGeneral.length === 0 ? (
                  <p className="text-white/40 text-xs">{t('common.loading')}</p>
                ) : (
                  <ul className="space-y-1">
                    {topClansGeneral.map((c, i) => (
                      <li
                        key={c.id}
                        onClick={() => navigate(`/groups/${c.id}`)}
                        className="flex items-center gap-1.5 cursor-pointer rounded-md px-1 py-1 hover:bg-champion-gold/10 transition-colors"
                      >
                        <span className="text-white/75 text-xs w-4 shrink-0 text-center">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                        </span>
                        <img
                          src={getImageUrl(c.logo)}
                          alt=""
                          className="w-7 h-7 rounded object-cover shrink-0 ring-1 ring-champion-gold/25"
                          onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_PROFILE_IMAGE_PATH; }}
                        />
                        <span className="text-white text-xs sm:text-sm font-medium truncate min-w-0 flex-1">
                          [{c.tag}]
                        </span>
                        <span className="text-champion-amber text-xs tabular-nums shrink-0">{formatScore(c.totalScore)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-champion-cyan/90 font-semibold mb-1.5">{t('home.season')}</p>
                {topClansSeason.length === 0 ? (
                  <p className="text-white/40 text-xs">{t('common.loading')}</p>
                ) : (
                  <ul className="space-y-1">
                    {topClansSeason.map((c, i) => (
                      <li
                        key={c.id}
                        onClick={() => navigate(`/groups/${c.id}`)}
                        className="flex items-center gap-1.5 cursor-pointer rounded-md px-1 py-1 hover:bg-champion-cyan/10 transition-colors"
                      >
                        <span className="text-white/75 text-xs w-4 shrink-0 text-center">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                        </span>
                        <img
                          src={getImageUrl(c.logo)}
                          alt=""
                          className="w-7 h-7 rounded object-cover shrink-0 ring-1 ring-champion-cyan/25"
                          onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_PROFILE_IMAGE_PATH; }}
                        />
                        <span className="text-white text-xs sm:text-sm font-medium truncate min-w-0 flex-1">
                          [{c.tag}]
                        </span>
                        <span className="text-champion-cyan/90 text-xs tabular-nums shrink-0">{formatScore(c.totalScore)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="px-3 pb-2.5">
              <button
                type="button"
                onClick={() => navigate('/groups')}
                className="w-full bg-champion-gold/10 hover:bg-champion-gold/20 border border-champion-gold/25 text-white font-semibold py-1.5 text-xs rounded-md transition-colors"
              >
                {t('home.viewAllClans')}
              </button>
            </div>
          </motion.div>
        </aside>

        {/* Coluna notícias + cartas */}
        <div className="min-w-0 flex flex-col gap-2.5">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`${homePanel} relative flex-1 min-h-[14rem] sm:min-h-[16rem]`}
            onMouseEnter={() => setNewsPaused(true)}
            onMouseLeave={() => setNewsPaused(false)}
            onFocusCapture={() => setNewsPaused(true)}
            onBlurCapture={() => setNewsPaused(false)}
          >
            <div
              className="game-panel-header !px-3.5 !py-2.5"
              
            >
              <h2 className="game-panel-title !text-sm flex items-center gap-1.5">
                <span aria-hidden>📰</span> {t('home.latestNews')}
              </h2>
              {news.length > 1 && (
                <div className="ml-auto flex items-center gap-1.5">
                  {news.map((item, i) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`Notícia ${i + 1}`}
                      onClick={() => goToNews(i)}
                      className={`h-2 rounded-full transition-all ${
                        i === newsIndex ? 'w-5 bg-champion-gold' : 'w-2 bg-white/25 hover:bg-white/45'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            {news.length > 1 && !newsPaused && (
              <div className="absolute left-0 right-0 top-[3rem] z-10 h-0.5 bg-white/5 overflow-hidden">
                <div key={newsIndex} className="home-news-progress h-full w-full" />
              </div>
            )}

            <div className="relative flex-1 min-h-[11rem] sm:min-h-[12.5rem] overflow-hidden">
              {news.length > 0 ? (
                <>
                  <AnimatePresence mode="wait" initial={false} custom={newsDirection.current}>
                    {(() => {
                      const item = news[newsIndex] ?? news[0];
                      const preview =
                        item.content.length > 180
                          ? `${item.content.substring(0, 180)}...`
                          : item.content;
                      return (
                        <motion.button
                          key={item.id}
                          type="button"
                          custom={newsDirection.current}
                          variants={{
                            enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
                            center: { x: 0, opacity: 1 },
                            exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
                          }}
                          initial="enter"
                          animate="center"
                          exit="exit"
                          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                          onClick={() => setSelectedNewsModal(item)}
                          className="absolute inset-0 w-full text-left px-4 py-3.5 group"
                        >
                          {item.image && (
                            <div className="pointer-events-none absolute inset-0 opacity-[0.16]">
                              <img
                                src={getImageUrl(item.image)}
                                alt=""
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                              <div className="home-news-image-overlay absolute inset-0" />
                            </div>
                          )}
                          <div className="relative z-10 flex h-full flex-col">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              {item.isPinned && (
                                <span className="text-champion-gold text-xs font-bold">📌 {t('home.pinned')}</span>
                              )}
                              {item.isNew && (
                                <span className="px-2 py-0.5 bg-champion-crimson/90 text-white text-[10px] font-bold rounded animate-pulse">
                                  NEW
                                </span>
                              )}
                              <span className="text-arena-mist text-xs ml-auto">
                                {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            <h3 className="font-display text-lg sm:text-xl font-bold text-white leading-snug line-clamp-2 group-hover:text-champion-gold transition-colors">
                              {item.title}
                            </h3>
                            <p className="mt-1.5 text-white/80 text-xs sm:text-sm line-clamp-3 flex-1">
                              {preview}
                            </p>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <span className="text-xs text-arena-mist truncate">
                                {item.author?.clanTag ? `|${item.author.clanTag}| ` : ''}
                                {item.author?.nickname || 'Admin'}
                              </span>
                              <span className="text-xs font-semibold text-champion-cyan group-hover:text-champion-gold transition-colors shrink-0">
                                {t('home.open')} →
                              </span>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })()}
                  </AnimatePresence>

                  {news.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="Notícia anterior"
                        onClick={(e) => {
                          e.stopPropagation();
                          goToNews(newsIndex - 1);
                        }}
                        className="absolute left-1.5 top-1/2 z-20 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white/80 hover:bg-champion-gold/20 hover:text-white hover:border-champion-gold/40 transition-colors"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        aria-label="Próxima notícia"
                        onClick={(e) => {
                          e.stopPropagation();
                          goToNews(newsIndex + 1);
                        }}
                        className="absolute right-1.5 top-1/2 z-20 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white/80 hover:bg-champion-gold/20 hover:text-white hover:border-champion-gold/40 transition-colors"
                      >
                        ›
                      </button>
                    </>
                  )}
                </>
              ) : (
                <div className="flex h-full min-h-[11rem] items-center justify-center text-white/60 text-sm px-3">
                  {t('home.noNews')}
                </div>
              )}
            </div>
          </motion.div>

          <LatestCardsMarquee cards={shopCards} showVerLoja compact />

          {/* Estatísticas */}
          <div className="w-full min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`${homePanel} w-full`}
            >
            <div className="game-panel-header">
              <h2 className="game-panel-title flex items-center gap-2">
                <span className="text-base sm:text-lg leading-none" aria-hidden>📊</span>
                {t('home.statistics')}
              </h2>
            </div>
            {publicStats === null ? (
              <div className="px-3 py-3">
                <p className="text-white/45 text-xs sm:text-sm">{t('home.unavailable')}</p>
              </div>
            ) : (
              <div className="px-3 py-3 sm:px-4 sm:py-3.5 inline-grid gap-x-2 gap-y-2 sm:gap-x-2.5 sm:gap-y-2.5 [grid-template-columns:repeat(3,minmax(0,max-content))] sm:[grid-template-columns:repeat(4,minmax(0,max-content))]">
                <div className="game-stat-chip">
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-arena-mist leading-tight">Temp.</p>
                  <p className="text-white font-semibold text-sm sm:text-base tabular-nums mt-0.5">{publicStats.currentSeasonNumber}º</p>
                </div>
                {publicStats.seasonEndsInDays != null && (
                  <div className="game-stat-chip">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-arena-mist leading-tight">Fim</p>
                    <p className="text-champion-gold font-semibold text-sm sm:text-base tabular-nums mt-0.5">
                      {publicStats.seasonEndsInDays}d
                    </p>
                  </div>
                )}
                <div className="game-stat-chip">
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-arena-mist leading-tight">Duelistas</p>
                  <p className="text-white font-semibold text-sm sm:text-base tabular-nums mt-0.5">{publicStats.totalDuelists.toLocaleString('pt-BR')}</p>
                </div>
                <div className="game-stat-chip">
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-arena-mist leading-tight">Duelos</p>
                  <p className="text-white font-semibold text-sm sm:text-base tabular-nums mt-0.5">{publicStats.totalDuels.toLocaleString('pt-BR')}</p>
                </div>
                <div className="game-stat-chip col-span-3 sm:col-span-2" >
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-arena-mist leading-tight">Online</p>
                  <p className="text-champion-cyan font-bold text-lg sm:text-xl tabular-nums leading-tight mt-0.5">
                    {publicStats.playersOnline.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="game-stat-chip">
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-arena-mist leading-tight">Torneios</p>
                  <p className="text-white font-semibold text-sm sm:text-base tabular-nums mt-0.5">{publicStats.tournamentsFinished.toLocaleString('pt-BR')}</p>
                </div>
                <div className="game-stat-chip">
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-arena-mist leading-tight">Cartas</p>
                  <p className="text-white font-semibold text-sm sm:text-base tabular-nums mt-0.5">{publicStats.cardsRegistered.toLocaleString('pt-BR')}</p>
                </div>
                {publicStats.maxOnlineToday > 0 && (
                  <div className="game-stat-chip">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-arena-mist leading-tight">Pico hoje</p>
                    <p className="text-white font-semibold text-sm sm:text-base tabular-nums mt-0.5">{publicStats.maxOnlineToday.toLocaleString('pt-BR')}</p>
                  </div>
                )}
                {publicStats.maxOnlineYesterday > 0 && (
                  <div className="game-stat-chip">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-arena-mist leading-tight">Pico ontem</p>
                    <p className="text-white font-semibold text-sm sm:text-base tabular-nums mt-0.5">{publicStats.maxOnlineYesterday.toLocaleString('pt-BR')}</p>
                  </div>
                )}
              </div>
            )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Modal da notícia */}
      {selectedNewsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 duel-modal-scrim"
          onClick={() => setSelectedNewsModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="news-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden game-panel shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-y-auto max-h-[90vh] custom-scrollbar p-4 sm:p-6">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  {selectedNewsModal.isPinned && (
                    <span className="text-white text-xs font-bold shrink-0">📌 {t('home.pinned')}</span>
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
