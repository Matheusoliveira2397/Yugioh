import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSocket } from '../hooks/useSocket';
import { getProfileImageUrl, DEFAULT_PROFILE_IMAGE_PATH } from '../utils/imageUrl';
import api from '../api/axios';
import CardImage from '../components/CardImage';
import { useI18n } from '../i18n/I18nContext';

type DuelQueueMode = 'ranked' | 'casual' | 'anime';

function formatSearchTimer(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface AnimeDeckCardEntry {
  quantity?: number;
  isExtraDeck?: boolean;
  card?: { id: string; name: string; cardImage?: string; idCarta?: string } | null;
}

interface AnimeDeckOption {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  coverCard?: { id: string; name: string; cardImage?: string; idCarta?: string } | null;
  cards?: AnimeDeckCardEntry[];
}

/** Tipo explícito (evita `ReturnType<>` dentro de JSX — o `<` quebra o parser .tsx). */
type AnimeDeckExpandedSlots = Array<{ card: AnimeDeckCardEntry['card']; key: string }>;

const animePreviewCardImageProps = {
  singleLayerImage: true,
  omitNameBasedPaths: true,
  pathExtensions: ['.webp', '.jpg', '.jpeg', '.png'] as const,
  loading: 'lazy' as const,
  sizes: '(max-width: 640px) 12vw, 64px',
} as const;

/** Uma entrada por cópia física no deck (para mostrar todas na grade). */
function expandAnimeDeckEntries(list: AnimeDeckCardEntry[]): AnimeDeckExpandedSlots {
  const out: AnimeDeckExpandedSlots = [];
  list.forEach((row, rowIdx) => {
    const q = Math.max(0, Math.min(99, row.quantity ?? 1));
    const c = row.card;
    for (let i = 0; i < q; i++) {
      out.push({ card: c, key: `${c?.id ?? 'x'}-${rowIdx}-${i}` });
    }
  });
  return out;
}

interface LevelRange {
  id: number;
  minLevel: number;
  maxLevel: number;
  name: string;
  order: number;
  isActive: boolean;
  cashOnWin: number;
  cashOnLoss: number;
}

interface MyDeckOption {
  id: string;
  name: string;
  cards?: Array<{ isExtraDeck?: boolean; card?: { id: string; name: string; cardImage?: string; idCarta?: string } }>;
  coverCard?: { id: string; name: string; cardImage?: string; idCarta?: string } | null;
}

interface SiteTab {
  key: string;
  isActive: boolean;
}

export default function RandomDuelPage() {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const { isConnected, isSearching, duelFound, duelError, clearDuelFound, clearDuelError, searchDuel, cancelSearch, getSocket } = useSocket();
  const [isCreatingDuel, setIsCreatingDuel] = useState(false);
  const [levelRange, setLevelRange] = useState<LevelRange | null>(null);
  const [searchElapsedSeconds, setSearchElapsedSeconds] = useState(0);
  const [duelMode, setDuelMode] = useState<DuelQueueMode>('casual');
  const [showModeMenu, setShowModeMenu] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);
  const [animeDecks, setAnimeDecks] = useState<AnimeDeckOption[]>([]);
  const [selectedAnimeDeckId, setSelectedAnimeDeckId] = useState<string | null>(null);
  const [animeDecksLoading, setAnimeDecksLoading] = useState(false);
  const [myDecks, setMyDecks] = useState<MyDeckOption[]>([]);
  const [myDecksLoading, setMyDecksLoading] = useState(false);
  const [equippingDeckId, setEquippingDeckId] = useState<string | null>(null);
  const [showDeckPicker, setShowDeckPicker] = useState(false);
  const [randomStats, setRandomStats] = useState<{ total: number; wins: number; losses: number } | null>(null);
  const [rankedStats, setRankedStats] = useState<{
    total: number;
    wins: number;
    losses: number;
    rankedPoints: number;
  } | null>(null);
  const [isRandomAnimeEnabled, setIsRandomAnimeEnabled] = useState(true);
  const [animeDeckPreview, setAnimeDeckPreview] = useState<AnimeDeckOption | null>(null);
  const handlerRef = useRef<((data: any) => void) | null>(null);
  const isOpeningRef = useRef<boolean>(false);
  const searchStartTimeRef = useRef<number | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fecha o menu de modos ao começar a procurar
  useEffect(() => {
    if (isSearching) setShowModeMenu(false);
  }, [isSearching]);

  // Contador de tempo enquanto procura duelo
  useEffect(() => {
    if (isSearching) {
      searchStartTimeRef.current = Date.now();
      setSearchElapsedSeconds(0);
      searchTimerRef.current = setInterval(() => {
        if (searchStartTimeRef.current) {
          setSearchElapsedSeconds(Math.floor((Date.now() - searchStartTimeRef.current) / 1000));
        }
      }, 1000);
    } else {
      if (searchTimerRef.current) {
        clearInterval(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      searchStartTimeRef.current = null;
      setSearchElapsedSeconds(0);
    }
    return () => {
      if (searchTimerRef.current) {
        clearInterval(searchTimerRef.current);
        searchTimerRef.current = null;
      }
    };
  }, [isSearching]);
  
  // Buscar faixa de nível do jogador
  useEffect(() => {
    const fetchLevelRange = async () => {
      if (!user?.level) return;
      
      try {
        const response = await fetch(`${API_URL}/public/random-duel-level-ranges/for-level/${user.level}`);
        if (response.ok) {
          const range = await response.json();
          setLevelRange(range);
        }
      } catch (error) {
        console.error('Erro ao buscar faixa de nível:', error);
      }
    };
    
    fetchLevelRange();
  }, [user?.level, API_URL]);

  // Estatísticas Casual + Ranked
  useEffect(() => {
    if (!user?.id) return;
    api
      .get<{ total: number; wins: number; losses: number }>('/duels/stats/random/my')
      .then((res) => {
        if (res.data && typeof (res.data as any).total === 'number') {
          setRandomStats({
            total: (res.data as any).total,
            wins: (res.data as any).wins ?? 0,
            losses: (res.data as any).losses ?? 0,
          });
        }
      })
      .catch(() => setRandomStats({ total: 0, wins: 0, losses: 0 }));

    api
      .get<{ total: number; wins: number; losses: number; rankedPoints: number }>(
        '/duels/stats/ranked/my',
      )
      .then((res) => {
        if (res.data && typeof (res.data as any).rankedPoints === 'number') {
          setRankedStats({
            total: (res.data as any).total ?? 0,
            wins: (res.data as any).wins ?? 0,
            losses: (res.data as any).losses ?? 0,
            rankedPoints: (res.data as any).rankedPoints ?? 1000,
          });
        }
      })
      .catch(() =>
        setRankedStats({
          total: 0,
          wins: 0,
          losses: 0,
          rankedPoints: user.rankedPoints ?? 1000,
        }),
      );
  }, [user?.id, user?.rankedPoints]);

  // Verificar se a aba "Random Anime" está ativa no painel admin
  useEffect(() => {
    const fetchRandomAnimeTabStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/public/site-tabs/active`);
        if (!response.ok) return;
        const data = await response.json();
        const tabs: SiteTab[] = Array.isArray(data) ? data : [];
        const randomAnimeTab = tabs.find((tab) => tab.key === 'random-anime');
        setIsRandomAnimeEnabled(!!randomAnimeTab?.isActive);
      } catch {
        // Em caso de erro, manter habilitado para não bloquear funcionalidade existente.
        setIsRandomAnimeEnabled(true);
      }
    };

    fetchRandomAnimeTabStatus();
  }, []);

  // Se a aba for desativada no admin, voltar ao casual
  useEffect(() => {
    if (!isRandomAnimeEnabled && duelMode === 'anime') {
      setDuelMode('casual');
    }
  }, [isRandomAnimeEnabled, duelMode]);

  // Fechar menu de modos ao clicar fora
  useEffect(() => {
    if (!showModeMenu) return;
    const onDown = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setShowModeMenu(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showModeMenu]);

  // Buscar decks do usuário quando modo casual ou ranked
  useEffect(() => {
    if (duelMode !== 'casual' && duelMode !== 'ranked') return;
    setMyDecksLoading(true);
    api
      .get<MyDeckOption[]>('/decks')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setMyDecks(list);
      })
      .catch(() => setMyDecks([]))
      .finally(() => setMyDecksLoading(false));
  }, [duelMode]);

  // Buscar decks anime ativos quando modo Animes Deck (usa api para enviar token do store)
  useEffect(() => {
    if (duelMode !== 'anime') return;
    setAnimeDecksLoading(true);
    api
      .get('/anime-decks/active')
      .then((res) => {
        const data = res.data;
        const list = Array.isArray(data) ? data : [];
        setAnimeDecks(list);
        if (list.length > 0) {
          setSelectedAnimeDeckId((prev) => (prev && list.some((d: AnimeDeckOption) => d.id === prev) ? prev : list[0].id));
        } else {
          setSelectedAnimeDeckId(null);
        }
      })
      .catch(() => {
        setAnimeDecks([]);
        setSelectedAnimeDeckId(null);
      })
      .finally(() => setAnimeDecksLoading(false));
  }, [duelMode]);

  useEffect(() => {
    if (!animeDeckPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAnimeDeckPreview(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [animeDeckPreview]);

  // Resetar isOpeningRef periodicamente se estiver travado
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (isOpeningRef.current) {
        // Verificar se há locks antigos no localStorage
        const allKeys = Object.keys(localStorage);
        const lockKeys = allKeys.filter(key => key.startsWith('duel_open_lock_'));
        let hasActiveLock = false;
        
        lockKeys.forEach(key => {
          try {
            const lockData = JSON.parse(localStorage.getItem(key) || '{}');
            const now = Date.now();
            // Se o lock tem menos de 10 segundos, considerar ativo
            if (lockData.timestamp && (now - lockData.timestamp < 10000)) {
              hasActiveLock = true;
            } else {
              // Remover locks expirados
              localStorage.removeItem(key);
            }
          } catch (e) {
            // Se houver erro, remover a chave
            localStorage.removeItem(key);
          }
        });
        
        // Se não há locks ativos, resetar a flag
        if (!hasActiveLock) {
          console.log('🔄 [RandomDuelPage] Resetando isOpeningRef - não há locks ativos');
          isOpeningRef.current = false;
        }
      }
    }, 2000); // Verificar a cada 2 segundos
    
    return () => clearInterval(checkInterval);
  }, []);

  // Debug: logar duelFound sempre que mudar
  useEffect(() => {
    console.log('🔄 [RandomDuelPage] ==========================================');
    console.log('🔄 [RandomDuelPage] duelFound mudou:', duelFound);
    if (duelFound) {
      console.log('🔄 [RandomDuelPage] player1Id:', duelFound.player1Id);
      console.log('🔄 [RandomDuelPage] player2Id:', duelFound.player2Id);
      console.log('🔄 [RandomDuelPage] duelId:', duelFound.duelId);
      console.log('🔄 [RandomDuelPage] duelId tipo:', typeof duelFound.duelId);
      console.log('🔄 [RandomDuelPage] duelId existe?', !!duelFound.duelId);
      console.log('🔄 [RandomDuelPage] opponent:', duelFound.opponent);
      console.log('🔄 [RandomDuelPage] duelFound completo:', JSON.stringify(duelFound, null, 2));
      console.log('🔄 [RandomDuelPage] ==========================================');
    } else {
      console.log('🔄 [RandomDuelPage] duelFound é null/undefined');
    }
  }, [duelFound]);

  // CRÍTICO: Listener global para duelCreated que verifica lock antes de abrir
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const globalDuelCreatedHandler = (data: any) => {
      if (!data?.duelId) return;
      
      // ID agora é UUID (string), não converter para número
      const duelIdStr = typeof data.duelId === 'string' ? data.duelId : String(data.duelId);
      const currentTabId = sessionStorage.getItem('socket_tab_id') || `tab_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      const globalLockKey = `duel_open_lock_${duelIdStr}`;
      
      // Verificar se já existe um lock (outra aba já está abrindo)
      const lockAttempt = localStorage.getItem(globalLockKey);
      const now = Date.now();
      
      if (lockAttempt) {
        try {
          const { tabId: lockerTabId, timestamp } = JSON.parse(lockAttempt);
          // Se outra aba já está abrindo (menos de 5s), não abrir
          if (lockerTabId !== currentTabId && (now - timestamp < 5000)) {
            console.log(`⚠️ [RandomDuelPage] Listener global: Outra aba (${lockerTabId}) já está abrindo o duelo ${duelIdStr}. Esta aba (${currentTabId}) ignorando.`);
            return;
          }
        } catch (e) {
          // Se houver erro ao parsear, continuar
        }
      }

      // Se já está abrindo, não fazer nada
      if (isOpeningRef.current) {
        console.log('⚠️ [RandomDuelPage] Listener global: Já está abrindo um duelo, ignorando...');
        return;
      }

      // Se o duelo já tem duelId e é o mesmo, não abrir novamente (já foi aberto pelo link)
      if (duelFound?.duelId && duelFound.duelId === duelIdStr) {
        console.log(`⚠️ [RandomDuelPage] Listener global: Duelo ${duelIdStr} já está no estado, provavelmente já foi aberto. Ignorando...`);
        return;
      }

      // Criar lock ANTES de abrir
      localStorage.setItem(globalLockKey, JSON.stringify({ tabId: currentTabId, timestamp: now }));
      isOpeningRef.current = true;

      console.log(`🚀 [RandomDuelPage] Listener global: Abrindo duelo ${duelIdStr} em nova aba em 500ms...`);
      
      setTimeout(() => {
        const newWindow = window.open(`/duel/${duelIdStr}`, '_blank');
        if (!newWindow) {
          console.error('❌ [RandomDuelPage] Listener global: Falha ao abrir nova aba - popup bloqueado?');
          isOpeningRef.current = false;
          localStorage.removeItem(globalLockKey);
        } else {
          console.log('✅ [RandomDuelPage] Listener global: Nova aba aberta com sucesso!');
          setTimeout(() => {
            localStorage.removeItem(globalLockKey);
            isOpeningRef.current = false;
          }, 3000);
        }
      }, 500);
    };

    socket.on('duelCreated', globalDuelCreatedHandler);

    return () => {
      socket.off('duelCreated', globalDuelCreatedHandler);
    };
  }, [getSocket, duelFound]);

  const startQueueSearch = useCallback(() => {
    if (!user?.id) return;
    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
    if (duelMode === 'anime') {
      if (!selectedAnimeDeckId) return;
      searchDuel(userId, { mode: 'anime', animeDeckId: selectedAnimeDeckId });
      return;
    }
    if (duelMode === 'ranked') {
      searchDuel(userId, { mode: 'ranked' });
      return;
    }
    searchDuel(userId, { mode: 'casual' });
  }, [user?.id, duelMode, selectedAnimeDeckId, searchDuel]);

  const canSearch = useMemo(() => {
    if (!isConnected) return false;
    if (duelMode === 'anime') return !!selectedAnimeDeckId && animeDecks.length > 0;
    return true;
  }, [isConnected, duelMode, selectedAnimeDeckId, animeDecks.length]);

  const equippedDeckInfo = useMemo(() => {
    const deck = myDecks.find((d) => d.id === user?.equippedDeckId) ?? null;
    const mainDeckCount = deck ? (deck.cards?.filter((c) => !c.isExtraDeck).length ?? 0) : 0;
    const coverCard = deck ? (deck.coverCard ?? deck.cards?.[0]?.card ?? null) : null;
    return {
      deck,
      mainDeckCount,
      coverCard,
      isValid: !!deck && mainDeckCount >= 40,
    };
  }, [myDecks, user?.equippedDeckId]);

  const modeMeta = useMemo(() => {
    if (duelMode === 'ranked') {
      return {
        icon: '🏆',
        title: t('randomDuel.modeRanked'),
        border: 'border-amber-400/55',
        bg: 'bg-amber-950/45 hover:bg-amber-950/65',
        ring: 'ring-amber-400/30',
        soft: 'text-amber-200',
      };
    }
    if (duelMode === 'anime') {
      return {
        icon: '🎬',
        title: t('randomDuel.animeDeck'),
        border: 'border-fuchsia-400/55',
        bg: 'bg-fuchsia-950/45 hover:bg-fuchsia-950/65',
        ring: 'ring-fuchsia-400/30',
        soft: 'text-fuchsia-200',
      };
    }
    return {
      icon: '🎲',
      title: t('randomDuel.modeCasual'),
      border: 'border-purple-400/55',
      bg: 'bg-purple-950/45 hover:bg-purple-950/65',
      ring: 'ring-purple-400/30',
      soft: 'text-purple-200',
    };
  }, [duelMode, t]);

  const activeStats = duelMode === 'ranked' ? rankedStats : randomStats;
  const statsWins = activeStats?.wins ?? 0;
  const statsLosses = activeStats?.losses ?? 0;
  const statsTotal = activeStats?.total ?? 0;
  const winRate = statsTotal > 0 ? Math.round((statsWins / statsTotal) * 100) : 0;
  const selectedAnimeDeck = animeDecks.find((d) => d.id === selectedAnimeDeckId) ?? null;

  if (!user) return null;

  return (
    <div className="min-h-[100svh] flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="max-w-3xl w-full text-center py-2 sm:py-4">
        {/* Erro da busca (ex.: "já tem duelo ativo", timeout, deck não equipado) */}
        {duelError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 rounded-xl bg-red-900/40 border border-red-500/50 text-red-200 flex flex-col sm:flex-row items-center justify-between gap-3"
          >
            <span className="flex-1 text-left">{duelError}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  clearDuelError();
                  startQueueSearch();
                }}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium"
              >
                {t('common.tryAgain')}
              </button>
              <button
                type="button"
                onClick={clearDuelError}
                className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm"
              >
                {t('common.close')}
              </button>
            </div>
          </motion.div>
        )}
        {duelFound ? (
          /* Card "Partida encontrada" integrado à página (mesma área do Random Duel) */
          <motion.div
            key="match-found-card"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-3 sm:space-y-4 w-full rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-b from-gray-900/90 to-black/90 p-4 sm:p-6 md:p-8"
          >
            <div className="flex flex-col items-center">
              <p className="text-emerald-400 text-lg sm:text-xl font-semibold tracking-wider uppercase mb-1">
                {t('randomDuel.matchFound')}
              </p>
              <div className="w-16 sm:w-20 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent rounded-full mb-3 sm:mb-4" />
            </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="space-y-3 sm:space-y-4 w-full"
          >
            {/* Logo e Título */}
            <div className="mb-3 sm:mb-4">
              <div className="flex flex-col items-center mb-2 sm:mb-3">
                <motion.div
                  animate={{ 
                    scale: [1, 1.05, 1],
                    filter: ['brightness(1)', 'brightness(1.3)', 'brightness(1)']
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="relative mb-2"
                >
                  <motion.div
                    animate={{ 
                      boxShadow: [
                        '0 0 30px rgba(34, 197, 94, 0.4)',
                        '0 0 50px rgba(34, 197, 94, 0.6)',
                        '0 0 30px rgba(34, 197, 94, 0.4)'
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 bg-green-500/40 rounded-2xl blur-2xl"
                  />
                  <img 
                    src="/images/Icones/RandomDuel.png" 
                    alt="Random Duel"
                    className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 object-contain drop-shadow-2xl"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </motion.div>
                <motion.h2
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-xl sm:text-2xl md:text-3xl font-bold text-green-400 mb-1 drop-shadow-lg"
                >
                  {t('randomDuel.duelFound')}
                </motion.h2>
              </div>

              {/* Info do Oponente */}
              <div className="mb-3 sm:mb-4">
                <div className="flex flex-col items-center gap-2 sm:gap-3">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="relative"
                  >
                    <motion.div
                      animate={{ 
                        scale: [1, 1.1, 1],
                        boxShadow: [
                          '0 0 20px rgba(239, 68, 68, 0.4)',
                          '0 0 30px rgba(239, 68, 68, 0.6)',
                          '0 0 20px rgba(239, 68, 68, 0.4)'
                        ]
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 bg-red-500 rounded-full blur-xl opacity-50"
                    />
                    <img 
                      src={getProfileImageUrl(duelFound.opponent?.profileImage)}
                      alt={duelFound.opponent?.nickname || 'Oponente'}
                      className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 sm:border-4 border-red-500 shadow-lg object-cover"
                      onError={(e) => {
                        e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                      }}
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-center bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-sm rounded-xl p-3 sm:p-4 md:p-5 border border-red-500/20"
                  >
                    <p className="text-white text-base sm:text-lg mb-1 font-semibold">{t('randomDuel.opponent')}</p>
                    <p className="text-xl sm:text-2xl md:text-3xl font-bold text-red-400 drop-shadow-lg break-words">
                      {duelFound.opponent?.clanTag ? `|${duelFound.opponent.clanTag}| ` : ''}
                      {duelFound.opponent?.nickname || 'Oponente'}
                    </p>
                    {duelFound.opponent?.level && (
                      <p className="text-white/80 mt-1 text-sm sm:text-base">Nível: {duelFound.opponent.level} ⭐</p>
                    )}
                  </motion.div>
                </div>
              </div>
            </div>
            {duelFound.duelId ? (
              // Se já tem duelId, mostrar apenas o link para abrir
              <motion.a
                href={`/duel/${duelFound.duelId}`}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 px-6 sm:px-10 py-3 sm:py-4 rounded-xl text-lg sm:text-xl md:text-2xl font-bold cursor-pointer hover:shadow-lg hover:shadow-purple-500/50 transition-all inline-block text-white"
                onClick={(e) => {
                  // CRÍTICO: SEMPRE prevenir comportamento padrão do link
                  e.preventDefault();
                  
                  // CRÍTICO: Verificar se já está abrindo (evitar múltiplos cliques)
                  if (isOpeningRef.current) {
                    console.log('⚠️ [RandomDuelPage] Já está abrindo um duelo, ignorando clique no link...');
                    console.log('⚠️ [RandomDuelPage] Tentando limpar locks antigos...');
                    
                    // Tentar limpar locks antigos
                    const duelIdStr = typeof duelFound.duelId === 'string' ? duelFound.duelId : String(duelFound.duelId);
                    const globalLockKey = `duel_open_lock_${duelIdStr}`;
                    const lockAttempt = localStorage.getItem(globalLockKey);
                    
                    if (lockAttempt) {
                      try {
                        const { timestamp } = JSON.parse(lockAttempt);
                        const now = Date.now();
                        // Se o lock tem mais de 5 segundos, considerar expirado e limpar
                        if (now - timestamp > 5000) {
                          console.log('🔄 [RandomDuelPage] Lock expirado, limpando...');
                          localStorage.removeItem(globalLockKey);
                          isOpeningRef.current = false;
                          // Tentar abrir novamente
                          const newWindow = window.open(`/duel/${duelIdStr}`, '_blank');
                          if (newWindow) {
                            console.log('✅ [RandomDuelPage] Duelo aberto após limpar lock!');
                            isOpeningRef.current = true;
                            setTimeout(() => {
                              isOpeningRef.current = false;
                            }, 3000);
                          }
                        }
                      } catch (e) {
                        // Se houver erro, limpar mesmo assim
                        localStorage.removeItem(globalLockKey);
                        isOpeningRef.current = false;
                      }
                    } else {
                      // Se não há lock, resetar a flag
                      console.log('🔄 [RandomDuelPage] Não há lock, resetando flag...');
                      isOpeningRef.current = false;
                    }
                    
                    return;
                  }

                  // Verificar se já foi aberto por outra aba usando localStorage
                  // ID agora é UUID (string), não converter para número
                  const duelIdStr = typeof duelFound.duelId === 'string' ? duelFound.duelId : String(duelFound.duelId);
                  const currentTabId = sessionStorage.getItem('socket_tab_id') || `tab_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
                  const globalLockKey = `duel_open_lock_${duelIdStr}`;
                  
                  // CRÍTICO: Verificar lock global primeiro
                  const lockAttempt = localStorage.getItem(globalLockKey);
                  const now = Date.now();
                  
                  if (lockAttempt) {
                    try {
                      const { tabId: lockerTabId, timestamp } = JSON.parse(lockAttempt);
                      // Se outra aba já está abrindo (menos de 5s), não abrir
                      if (lockerTabId !== currentTabId && (now - timestamp < 5000)) {
                        console.log(`⚠️ [RandomDuelPage] Outra aba (${lockerTabId}) já está abrindo o duelo ${duelIdStr}. Esta aba ignorando.`);
                        return;
                      }
                    } catch (e) {
                      // Se houver erro, continuar
                    }
                  }
                  
                  // CRÍTICO: Criar lock global ANTES de abrir
                  localStorage.setItem(globalLockKey, JSON.stringify({ tabId: currentTabId, timestamp: now }));
                  
                  // Marcar como abrindo ANTES de abrir
                  isOpeningRef.current = true;
                  
                  console.log(`🚀 [RandomDuelPage] Abrindo duelo ${duelIdStr} em nova aba`);
                  const newWindow = window.open(`/duel/${duelIdStr}`, '_blank');
                  if (!newWindow) {
                    console.error('❌ [RandomDuelPage] Falha ao abrir nova aba - popup bloqueado?');
                    alert('Não foi possível abrir a nova aba. Verifique se os popups estão bloqueados.');
                    isOpeningRef.current = false;
                    localStorage.removeItem(globalLockKey);
                  } else {
                    console.log('✅ [RandomDuelPage] Nova aba aberta com sucesso!');
                    // Limpar lock após 2 segundos (mais rápido)
                    setTimeout(() => {
                      localStorage.removeItem(globalLockKey);
                      isOpeningRef.current = false;
                      console.log('🔄 [RandomDuelPage] Lock e flag resetados');
                    }, 2000);
                  }
                }}
              >
                ⚔️ Abrir Duelo
              </motion.a>
            ) : (
              // Se não tem duelId, criar o duelo primeiro (fallback para compatibilidade)
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('🔵 Botão clicado! duelFound completo:', JSON.stringify(duelFound, null, 2));
                  console.log('🔵 player1Id:', duelFound?.player1Id, 'player2Id:', duelFound?.player2Id);
                  
                  if (duelFound?.player1Id && duelFound?.player2Id) {
                    console.log('🔄 Criando duelo para:', duelFound.player1Id, 'vs', duelFound.player2Id);
                    setIsCreatingDuel(true);
                    
                    const socket = getSocket();
                    if (socket && socket.connected) {
                      const payload = {
                        player1Id: Number(duelFound.player1Id),
                        player2Id: Number(duelFound.player2Id),
                      };
                      console.log('📤 [RandomDuelPage] Enviando createDuelFromMatch:', payload);
                      
                      // CRÍTICO: Verificar se já está abrindo (evitar múltiplos cliques)
                      if (isOpeningRef.current) {
                        console.log('⚠️ [RandomDuelPage] Já está abrindo um duelo, ignorando clique...');
                        return;
                      }

                      // Registrar listener ANTES de enviar o evento
                      // CRÍTICO: Usar localStorage para coordenar entre abas e garantir que apenas uma abra o duelo
                      const currentTabId = sessionStorage.getItem('socket_tab_id') || `tab_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
                      const matchKey = `match_${payload.player1Id}_${payload.player2Id}`;
                      const duelKey = `duel_opener_${payload.player1Id}_${payload.player2Id}`;
                      
                      // Marcar esta aba como a responsável por abrir o duelo deste match
                      const timestamp = Date.now();
                      localStorage.setItem(matchKey, JSON.stringify({ tabId: currentTabId, timestamp }));
                      localStorage.setItem(duelKey, JSON.stringify({ tabId: currentTabId, timestamp }));
                      console.log(`🔒 [RandomDuelPage] Esta aba (${currentTabId}) marcada como responsável pelo match ${matchKey}`);
                      
                      // Remover listener anterior se existir
                      if (handlerRef.current) {
                        socket.off('duelCreated', handlerRef.current);
                      }
                      
                      const handler = (data: any) => {
                        console.log('✅ [RandomDuelPage] Duelo criado recebido:', data);
                        
                        // CRÍTICO: Verificar se já está abrindo (evitar múltiplos handlers)
                        if (isOpeningRef.current) {
                          console.log('⚠️ [RandomDuelPage] Já está abrindo um duelo, ignorando evento...');
                          socket.off('duelCreated', handler);
                          return;
                        }
                        
                        if (data.duelId) {
                          // ID agora é UUID (string), não converter para número
                          const duelIdStr = typeof data.duelId === 'string' ? data.duelId : String(data.duelId);
                          
                          // CRÍTICO: Usar um lock global por duelId para garantir que apenas uma aba abra
                          const globalLockKey = `duel_open_lock_${duelIdStr}`;
                          const lockAttempt = localStorage.getItem(globalLockKey);
                          const now = Date.now();
                          
                          // Se já existe um lock recente (menos de 5s), outra aba já está abrindo
                          if (lockAttempt) {
                            try {
                              const { tabId: lockerTabId, timestamp } = JSON.parse(lockAttempt);
                              if (lockerTabId !== currentTabId && (now - timestamp < 5000)) {
                                console.log(`⚠️ [RandomDuelPage] Outra aba (${lockerTabId}) já está abrindo o duelo ${duelIdStr}. Esta aba (${currentTabId}) ignorando.`);
                                socket.off('duelCreated', handler);
                                setIsCreatingDuel(false);
                                isOpeningRef.current = false;
                                localStorage.removeItem(matchKey);
                                localStorage.removeItem(duelKey);
                                return;
                              }
                            } catch (e) {
                              // Se houver erro ao parsear, continuar
                            }
                          }
                          
                          // Verificar qual aba deve abrir o duelo (a que marcou primeiro)
                          const stored = localStorage.getItem(matchKey);
                          const duelStored = localStorage.getItem(duelKey);
                          let shouldOpen = false;
                          
                          if (stored || duelStored) {
                            try {
                              const matchData = stored ? JSON.parse(stored) : null;
                              const duelData = duelStored ? JSON.parse(duelStored) : null;
                              const openerTabId = matchData?.tabId || duelData?.tabId;
                              const storedTimestamp = matchData?.timestamp || duelData?.timestamp;
                              
                              // Esta aba deve abrir se for a que marcou, ou se a marcação expirou (mais de 3s)
                              if (openerTabId === currentTabId || (now - storedTimestamp > 3000)) {
                                shouldOpen = true;
                              } else {
                                console.log(`⚠️ [RandomDuelPage] Outra aba (${openerTabId}) deve abrir o duelo ${duelIdStr}. Esta aba (${currentTabId}) ignorando.`);
                              }
                            } catch (e) {
                              // Se houver erro ao parsear, esta aba pode abrir
                              shouldOpen = true;
                            }
                          } else {
                            // Se não há marcação, esta aba pode abrir
                            shouldOpen = true;
                          }
                          
                          if (!shouldOpen) {
                            socket.off('duelCreated', handler);
                            setIsCreatingDuel(false);
                            isOpeningRef.current = false;
                            // Limpar flags
                            localStorage.removeItem(matchKey);
                            localStorage.removeItem(duelKey);
                            return;
                          }
                          
                          // CRÍTICO: Verificar lock global ANTES de criar lock (pode ter sido criado pelo listener global)
                          const existingLock = localStorage.getItem(globalLockKey);
                          if (existingLock) {
                            try {
                              const { tabId: lockerTabId, timestamp: lockTimestamp } = JSON.parse(existingLock);
                              // Se outra aba já está abrindo (menos de 5s), não abrir
                              if (lockerTabId !== currentTabId && (now - lockTimestamp < 5000)) {
                                console.log(`⚠️ [RandomDuelPage] Handler: Outra aba (${lockerTabId}) já está abrindo o duelo ${duelIdStr}. Esta aba (${currentTabId}) ignorando.`);
                                socket.off('duelCreated', handler);
                                handlerRef.current = null;
                                setIsCreatingDuel(false);
                                isOpeningRef.current = false;
                                localStorage.removeItem(matchKey);
                                localStorage.removeItem(duelKey);
                                return;
                              }
                            } catch (e) {
                              // Se houver erro ao parsear, continuar
                            }
                          }
                          
                          // CRÍTICO: Criar lock global ANTES de qualquer coisa
                          localStorage.setItem(globalLockKey, JSON.stringify({ tabId: currentTabId, timestamp: now }));
                          
                          // Marcar como abrindo ANTES de qualquer coisa
                          isOpeningRef.current = true;
                          socket.off('duelCreated', handler);
                          handlerRef.current = null;
                          setIsCreatingDuel(false);
                          
                          console.log(`🚀 [RandomDuelPage] Esta aba (${currentTabId}) abrindo duelo ${duelIdStr} em nova aba em 500ms...`);
                          
                          // Limpar flags ANTES de abrir
                          localStorage.removeItem(matchKey);
                          localStorage.removeItem(duelKey);
                          
                          // Aguardar 500ms para garantir que o duelo esteja no cache antes de abrir
                          setTimeout(() => {
                            // Verificar novamente o lock antes de abrir (pode ter sido alterado)
                            const finalLockCheck = localStorage.getItem(globalLockKey);
                            if (finalLockCheck) {
                              try {
                                const { tabId: finalLockerTabId } = JSON.parse(finalLockCheck);
                                if (finalLockerTabId !== currentTabId) {
                                  console.log(`⚠️ [RandomDuelPage] Lock foi alterado por outra aba, cancelando abertura...`);
                                  isOpeningRef.current = false;
                                  localStorage.removeItem(globalLockKey);
                                  return;
                                }
                              } catch (e) {
                                // Continuar se houver erro
                              }
                            }
                            
                            console.log(`🌐 [RandomDuelPage] Abrindo URL: /duel/${duelIdStr}`);
                            const newWindow = window.open(`/duel/${duelIdStr}`, '_blank');
                            if (!newWindow) {
                              console.error('❌ [RandomDuelPage] Falha ao abrir nova aba - popup bloqueado?');
                              alert('Não foi possível abrir a nova aba. Verifique se os popups estão bloqueados.');
                              isOpeningRef.current = false;
                              localStorage.removeItem(globalLockKey);
                            } else {
                              console.log('✅ [RandomDuelPage] Nova aba aberta com sucesso!');
                              // Limpar lock após 3 segundos
                              setTimeout(() => {
                                localStorage.removeItem(globalLockKey);
                                isOpeningRef.current = false;
                              }, 3000);
                            }
                          }, 500);
                        } else {
                          console.error('❌ [RandomDuelPage] Duelo criado sem duelId:', data);
                          isOpeningRef.current = false;
                          // Limpar flags em caso de erro
                          localStorage.removeItem(matchKey);
                          localStorage.removeItem(duelKey);
                        }
                      };
                      
                      // Salvar referência do handler
                      handlerRef.current = handler;
                      
                      // Registrar listener ANTES de enviar
                      console.log('👂 [RandomDuelPage] Registrando listener para duelCreated...');
                      socket.on('duelCreated', handler);
                      
                      // Enviar evento DEPOIS de registrar listener
                      console.log('📤 [RandomDuelPage] Emitindo createDuelFromMatch agora...');
                      socket.emit('createDuelFromMatch', payload, (response: any) => {
                        console.log('📥 [RandomDuelPage] Resposta do servidor:', response);
                      });
                      
                      // Timeout de segurança
                      setTimeout(() => {
                        console.log('⏰ [RandomDuelPage] Timeout de 10s atingido, removendo listener');
                        socket.off('duelCreated', handler);
                        handlerRef.current = null;
                        isOpeningRef.current = false;
                        if (isCreatingDuel) {
                          setIsCreatingDuel(false);
                          alert('Timeout ao criar duelo. Tente novamente.');
                        }
                        // Limpar flags e locks
                        localStorage.removeItem(matchKey);
                        localStorage.removeItem(duelKey);
                        // Limpar lock global se existir (caso o duelo tenha sido criado mas não aberto)
                        // ID agora é UUID (string), não converter para número
                        const duelIdStr = duelFound?.duelId ? (typeof duelFound.duelId === 'string' ? duelFound.duelId : String(duelFound.duelId)) : null;
                        if (duelIdStr) {
                          localStorage.removeItem(`duel_open_lock_${duelIdStr}`);
                        }
                      }, 10000);
                    } else {
                      console.error('❌ Socket não conectado!');
                      setIsCreatingDuel(false);
                      alert('Erro: Socket não conectado. Tente recarregar a página.');
                    }
                  } else {
                    console.error('❌ Dados do match incompletos!');
                    console.error('duelFound:', duelFound);
                    console.error('player1Id:', duelFound?.player1Id);
                    console.error('player2Id:', duelFound?.player2Id);
                    alert(`Erro: Dados do match incompletos.\nplayer1Id: ${duelFound?.player1Id}\nplayer2Id: ${duelFound?.player2Id}\n\nTente procurar novamente.`);
                  }
                }}
                disabled={isCreatingDuel}
                className="gradient blue-purple px-6 sm:px-10 py-3 sm:py-4 rounded-lg text-lg sm:text-xl md:text-2xl font-bold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed relative z-10"
                style={{ pointerEvents: isCreatingDuel ? 'none' : 'auto' }}
              >
                {isCreatingDuel ? '⏳ Criando Duelo...' : '⚔️ Entrar na Arena de Duelo'}
              </button>
            )}
            <p className="text-slate-500 text-xs sm:text-sm mt-2">
              (Abre em nova aba)
            </p>
            {/* Botão para fechar e voltar a procurar */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  if (user?.id) cancelSearch(user.id);
                  clearDuelFound();
                }}
                className="text-white/70 hover:text-white text-sm font-medium underline focus:outline-none focus:ring-2 focus:ring-emerald-400 rounded px-2 py-1"
              >
                ✕ {t('randomDuel.closeAndSearch')}
              </button>
            </div>
          </motion.div>
          </motion.div>
        ) : isSearching ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mx-auto w-full max-w-lg"
          >
            <div className="relative overflow-hidden rounded-2xl border border-purple-500/30 bg-gradient-to-b from-purple-950/70 via-slate-950/80 to-black/70 px-5 py-8 sm:px-8 sm:py-10 shadow-2xl shadow-purple-950/40">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.18),transparent_55%)]" />

              <div className="relative flex flex-col items-center gap-6">
                <div
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${modeMeta.border} ${modeMeta.bg} ${modeMeta.soft}`}
                >
                  <span>{modeMeta.icon}</span>
                  <span>{modeMeta.title}</span>
                </div>

                {/* VS row */}
                <div className="flex w-full items-center justify-center gap-4 sm:gap-8">
                  <div className="flex flex-col items-center gap-2 w-24 sm:w-28">
                    <img
                      src={getProfileImageUrl(user.profileImage)}
                      alt={user.nickname}
                      className="h-16 w-16 sm:h-20 sm:w-20 rounded-full border-2 border-purple-400/70 object-cover shadow-lg"
                      onError={(e) => {
                        e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                      }}
                    />
                    <p className="truncate w-full text-center text-sm font-semibold text-white">
                      {user.nickname}
                    </p>
                  </div>

                  <div className="relative flex h-28 w-28 sm:h-36 sm:w-36 items-center justify-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                      className="absolute inset-0 rounded-full border border-purple-400/20 border-t-purple-400/70"
                    />
                    <motion.div
                      animate={{ rotate: -360 }}
                      transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
                      className="absolute inset-3 rounded-full border border-pink-400/15 border-b-pink-400/60"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.6, 0.35] }}
                      transition={{ duration: 2.2, repeat: Infinity }}
                      className="absolute inset-6 rounded-full bg-purple-500/25 blur-md"
                    />
                    <div className="relative z-10 text-center">
                      <p className="text-[10px] uppercase tracking-widest text-white/45 mb-0.5">
                        {t('randomDuel.time')}
                      </p>
                      <p className="font-mono text-2xl sm:text-3xl font-bold tabular-nums text-amber-300">
                        {formatSearchTimer(searchElapsedSeconds)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2 w-24 sm:w-28">
                    <div className="relative h-16 w-16 sm:h-20 sm:w-20">
                      <motion.div
                        animate={{ opacity: [0.35, 0.7, 0.35] }}
                        transition={{ duration: 1.6, repeat: Infinity }}
                        className="absolute inset-0 rounded-full border-2 border-dashed border-white/25 bg-white/5"
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-2xl text-white/30">
                        ?
                      </span>
                    </div>
                    <p className="truncate w-full text-center text-sm font-medium text-white/40">
                      ???
                    </p>
                  </div>
                </div>

                <div className="text-center space-y-1.5">
                  <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300 bg-clip-text text-transparent">
                    {t('randomDuel.searching')}
                  </h2>
                  <motion.p
                    animate={{ opacity: [0.45, 1, 0.45] }}
                    transition={{ duration: 1.8, repeat: Infinity }}
                    className="text-sm text-white/65"
                  >
                    {t('randomDuel.waitSearch')}
                  </motion.p>
                  {(duelMode === 'casual' || duelMode === 'ranked') && equippedDeckInfo.deck && (
                    <p className="text-xs text-purple-200/80 pt-1">
                      {t('randomDuel.equippedDeck')}{' '}
                      <span className="font-semibold text-white/90">{equippedDeckInfo.deck.name}</span>
                    </p>
                  )}
                  {duelMode === 'anime' && selectedAnimeDeck && (
                    <p className="text-xs text-fuchsia-200/80 pt-1">
                      Deck:{' '}
                      <span className="font-semibold text-white/90">{selectedAnimeDeck.name}</span>
                    </p>
                  )}
                </div>

                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    if (user?.id) {
                      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
                      cancelSearch(userId);
                    }
                  }}
                  className="mt-1 rounded-xl border border-red-400/40 bg-red-600/80 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500"
                >
                  {t('randomDuel.cancelSearch')}
                </motion.button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto w-full max-w-xl space-y-4 sm:space-y-5"
          >
            <div className="text-center space-y-1.5 px-2">
              <p className="text-white/80 text-sm sm:text-base">{t('randomDuel.subtitle')}</p>
            </div>

            {/* Seletor de modo */}
            <div className="flex justify-center" ref={modeMenuRef}>
              <div className="relative w-full max-w-md">
                <button
                  type="button"
                  onClick={() => setShowModeMenu((v) => !v)}
                  className={`w-full flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition-all ring-1 ${modeMeta.border} ${modeMeta.bg} ${modeMeta.ring}`}
                  aria-expanded={showModeMenu}
                  aria-haspopup="listbox"
                >
                  <span className="text-2xl shrink-0">{modeMeta.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] uppercase tracking-wide text-white/45 font-medium">
                      {t('randomDuel.selectMode')}
                    </span>
                    <span className="block text-base sm:text-lg font-bold text-white truncate">
                      {modeMeta.title}
                    </span>
                    {duelMode === 'ranked' && (
                      <span className="block text-xs text-amber-200/80 tabular-nums mt-0.5">
                        {t('randomDuel.rankedPoints')}:{' '}
                        {rankedStats?.rankedPoints ?? user?.rankedPoints ?? 1000}
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-white/70 text-sm transition-transform ${showModeMenu ? 'rotate-180' : ''}`}
                  >
                    ▼
                  </span>
                </button>

                <AnimatePresence>
                  {showModeMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="absolute z-30 left-0 right-0 mt-2 rounded-2xl border border-white/15 bg-gray-950/95 backdrop-blur-md shadow-2xl overflow-hidden"
                      role="listbox"
                    >
                      {(
                        [
                          {
                            id: 'ranked' as const,
                            icon: '🏆',
                            title: t('randomDuel.modeRanked'),
                            desc: t('randomDuel.modeRankedDesc'),
                            enabled: true,
                          },
                          {
                            id: 'casual' as const,
                            icon: '🎲',
                            title: t('randomDuel.modeCasual'),
                            desc: t('randomDuel.modeCasualDesc'),
                            enabled: true,
                          },
                          {
                            id: 'anime' as const,
                            icon: '🎬',
                            title: t('randomDuel.animeDeck'),
                            desc: t('randomDuel.modeAnimeDesc'),
                            enabled: isRandomAnimeEnabled,
                          },
                        ] as const
                      )
                        .filter((m) => m.enabled)
                        .map((m) => {
                          const selected = duelMode === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() => {
                                setDuelMode(m.id);
                                setShowModeMenu(false);
                              }}
                              className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors border-b border-white/5 last:border-0 ${
                                selected ? 'bg-white/10' : 'hover:bg-white/5'
                              }`}
                            >
                              <span className="text-xl shrink-0 mt-0.5">{m.icon}</span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                  <span className="font-bold text-white text-sm sm:text-base">
                                    {m.title}
                                  </span>
                                  {selected && (
                                    <span className="text-[10px] font-semibold text-emerald-300">✓</span>
                                  )}
                                </span>
                                <span className="block text-xs text-white/55 mt-0.5 leading-snug">
                                  {m.desc}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Anime deck picker */}
            {duelMode === 'anime' && (
              <div className="rounded-2xl border border-fuchsia-500/25 bg-fuchsia-950/20 p-3 sm:p-4 text-left">
                <p className="text-white/90 text-sm font-semibold mb-3">{t('randomDuel.chooseDeck')}</p>
                {animeDecksLoading ? (
                  <p className="text-gray-400 text-sm">{t('randomDuel.loadingDecks')}</p>
                ) : animeDecks.length === 0 ? (
                  <p className="text-amber-400 text-sm">{t('randomDuel.noAnimeDecks')}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3 max-h-60 overflow-y-auto pr-0.5">
                    {animeDecks.map((deck) => {
                      const selected = selectedAnimeDeckId === deck.id;
                      return (
                        <div
                          key={deck.id}
                          className={`rounded-xl border-2 transition-all flex flex-col overflow-hidden ${
                            selected
                              ? 'bg-fuchsia-600/35 border-fuchsia-400 text-white shadow-lg shadow-fuchsia-950/40'
                              : 'bg-black/30 border-white/10 text-gray-300 hover:border-fuchsia-400/40'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedAnimeDeckId(deck.id)}
                            className="text-left px-2.5 pt-2.5 pb-2 flex items-center gap-2.5 w-full"
                          >
                            {deck.coverCard ? (
                              <div className="shrink-0 w-11 sm:w-12 aspect-[59/86] rounded-md overflow-hidden border border-white/20">
                                <CardImage
                                  {...animePreviewCardImageProps}
                                  sizes="48px"
                                  card={deck.coverCard}
                                  className="w-full h-full object-cover"
                                  fallback="/images/fundoCarta.webp"
                                />
                              </div>
                            ) : (
                              <div className="shrink-0 w-11 sm:w-12 aspect-[59/86] rounded-md bg-gray-700 border border-white/20 flex items-center justify-center text-lg">
                                🃏
                              </div>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="font-semibold text-xs sm:text-sm line-clamp-2 block leading-snug">
                                {deck.name}
                              </span>
                              {deck.cards && (
                                <span className="text-[10px] text-white/55 mt-0.5 block">
                                  {deck.cards.reduce((s, c) => s + (c.quantity ?? 1), 0)} cartas
                                </span>
                              )}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="w-full py-1.5 text-[11px] font-semibold bg-black/35 hover:duel-modal-scrim border-t border-white/10 text-fuchsia-200 hover:text-white transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAnimeDeckPreview(deck);
                            }}
                          >
                            Ver cartas
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Painel principal: duelista + deck + stats */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="rounded-2xl border border-purple-500/30 bg-gradient-to-b from-purple-950/50 via-slate-950/60 to-black/50 backdrop-blur-md shadow-xl shadow-purple-950/25 overflow-hidden"
            >
              {/* Player header + deck ao lado do nick */}
              <div className="flex items-center gap-2.5 sm:gap-3 px-4 sm:px-5 py-3.5 border-b border-white/8">
                <div className="relative shrink-0">
                  <motion.div
                    animate={{ opacity: [0.4, 0.75, 0.4] }}
                    transition={{ duration: 2.4, repeat: Infinity }}
                    className="absolute -inset-1 rounded-full bg-purple-500/30 blur-md"
                  />
                  <img
                    src={getProfileImageUrl(user.profileImage)}
                    alt={user.nickname}
                    className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-full border-2 border-purple-400/80 object-cover shadow-lg"
                    onError={(e) => {
                      e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                    }}
                  />
                </div>

                <div className="min-w-0 flex-1 text-left">
                  <h3 className="text-base sm:text-lg font-bold leading-tight text-white truncate">
                    {user.clanTag ? (
                      <>
                        <span className="text-purple-300/90">|{user.clanTag}|</span>{' '}
                        <span className="bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                          {user.nickname}
                        </span>
                      </>
                    ) : (
                      <span className="bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                        {user.nickname}
                      </span>
                    )}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {levelRange && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-purple-500/35 bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-100">
                        <span className="text-white/45">{t('randomDuel.levelRange')}</span>
                        <span className="font-semibold">{levelRange.name}</span>
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                        isConnected
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : 'border-red-500/40 bg-red-500/10 text-red-300'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`}
                      />
                      {isConnected ? t('randomDuel.connected') : t('randomDuel.disconnected')}
                    </span>
                  </div>
                </div>

                {/* Deck na frente do nick (ao lado direito) */}
                {(duelMode === 'casual' || duelMode === 'ranked') ? (
                  myDecksLoading ? (
                    <span className="text-[10px] text-gray-400 shrink-0">...</span>
                  ) : myDecks.length === 0 ? null : (
                    <div className="flex items-end gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowDeckPicker(true)}
                        title={equippedDeckInfo.deck?.name ?? t('randomDuel.noDeck')}
                        aria-label="Trocar deck equipado"
                        className={`relative w-[3.25rem] sm:w-14 shrink-0 overflow-hidden rounded border aspect-[59/86] transition-all ${
                          equippedDeckInfo.isValid
                            ? 'border-purple-400/55 hover:border-purple-300 hover:brightness-110'
                            : 'border-dashed border-amber-500/50 bg-gray-800/60'
                        }`}
                      >
                        {equippedDeckInfo.isValid && equippedDeckInfo.coverCard ? (
                          <CardImage
                            card={equippedDeckInfo.coverCard}
                            className="absolute inset-0 h-full w-full min-h-0"
                            style={{ backgroundSize: 'cover', backgroundPosition: 'top center' }}
                            fallback="/images/fundoCarta.webp"
                          />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
                            🃏
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeckPicker(true)}
                        className="mb-0.5 flex h-6 w-6 items-center justify-center rounded border border-purple-500/45 bg-purple-500/10 text-xs font-bold text-purple-200 hover:bg-purple-500/20"
                        aria-label="Trocar deck"
                      >
                        +
                      </button>
                    </div>
                  )
                ) : selectedAnimeDeck ? (
                  <button
                    type="button"
                    onClick={() => setAnimeDeckPreview(selectedAnimeDeck)}
                    title={selectedAnimeDeck.name}
                    className="relative w-[3.25rem] sm:w-14 shrink-0 overflow-hidden rounded border border-fuchsia-400/50 aspect-[59/86] hover:brightness-110 transition-all"
                  >
                    {selectedAnimeDeck.coverCard ? (
                      <CardImage
                        card={selectedAnimeDeck.coverCard}
                        className="absolute inset-0 h-full w-full min-h-0"
                        style={{ backgroundSize: 'cover', backgroundPosition: 'top center' }}
                        fallback="/images/fundoCarta.webp"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
                        🃏
                      </span>
                    )}
                  </button>
                ) : null}

                {duelMode === 'ranked' && (
                  <div className="shrink-0 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 text-center">
                    <p className="text-[8px] uppercase tracking-wide text-amber-200/70">
                      {t('randomDuel.rankedPoints')}
                    </p>
                    <p className="text-base sm:text-lg font-bold tabular-nums text-amber-300 leading-none mt-0.5">
                      {rankedStats?.rankedPoints ?? user.rankedPoints ?? 1000}
                    </p>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="px-4 sm:px-5 py-3.5">
                <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-white/40 text-left">
                  {duelMode === 'ranked'
                    ? t('randomDuel.rankedHistory')
                    : t('randomDuel.casualHistory')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2.5 text-center">
                    <p className="text-[10px] text-white/45">Duelos</p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums text-white">{statsTotal}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2.5 text-center">
                    <p className="text-[10px] text-white/45">Vit / Der</p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums">
                      <span className="text-emerald-400">{statsWins}</span>
                      <span className="text-white/30"> / </span>
                      <span className="text-rose-400">{statsLosses}</span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2.5 text-center">
                    <p className="text-[10px] text-white/45">Aproveit.</p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums text-purple-200">{winRate}%</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* CTA procurar — centralizado */}
            <div className="flex flex-col items-center gap-2 pt-1 pb-2">
              <motion.button
                type="button"
                whileHover={canSearch ? { scale: 1.04 } : {}}
                whileTap={canSearch ? { scale: 0.97 } : {}}
                onClick={startQueueSearch}
                disabled={!canSearch}
                className="border-0 bg-transparent p-0 shadow-none transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-45 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 rounded-xl"
                aria-label="Procurar duelo"
              >
                <img
                  src="/images/ProcurarDuelo.png"
                  alt=""
                  className="block h-auto w-[15rem] sm:w-[17rem] md:w-[18.5rem] max-w-[85vw] object-contain select-none drop-shadow-[0_14px_36px_rgba(0,0,0,0.65)]"
                  draggable={false}
                />
              </motion.button>
              {!isConnected && (
                <p className="text-xs text-red-300/90">Conecte-se para procurar um duelo.</p>
              )}
              {isConnected && duelMode === 'anime' && !selectedAnimeDeckId && (
                <p className="text-xs text-amber-300/90">Escolha um deck anime para começar.</p>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Modal: escolher deck para duelar */}
      {showDeckPicker && (duelMode === 'casual' || duelMode === 'ranked') && (
        <div
          className="fixed inset-0 duel-modal-scrim z-50 flex items-center justify-center p-4"
          onClick={() => setShowDeckPicker(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="deck-picker-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-gradient-to-br from-gray-900 to-black rounded-xl shadow-2xl border-2 border-purple-500/50 max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-purple-500/30 flex items-center justify-between flex-shrink-0">
              <h2 id="deck-picker-modal-title" className="text-lg font-bold text-white">
                Escolher deck para duelar
              </h2>
              <button
                type="button"
                onClick={() => setShowDeckPicker(false)}
                className="text-gray-400 hover:text-white transition-colors text-2xl font-bold leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-3 overflow-y-auto flex-1 min-h-0">
              {myDecksLoading ? (
                <p className="text-gray-400 text-sm text-center py-4">{t('common.loading')}</p>
              ) : myDecks.length === 0 ? (
                <p className="text-amber-400 text-sm text-center py-4">{t('randomDuel.noDeck')}</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {myDecks.map((deck) => {
                    const mainDeckCount = deck.cards?.filter((c) => !c.isExtraDeck).length ?? 0;
                    const canEquip = mainDeckCount >= 40;
                    const isEquipped = user?.equippedDeckId === deck.id;
                    const coverCard = deck.coverCard ?? deck.cards?.[0]?.card ?? null;
                    return (
                      <button
                        key={deck.id}
                        type="button"
                        disabled={(!canEquip && !isEquipped) || equippingDeckId !== null}
                        onClick={async () => {
                          if (!canEquip && !isEquipped) return;
                          if (isEquipped) {
                            setShowDeckPicker(false);
                            return;
                          }
                          setEquippingDeckId(deck.id);
                          try {
                            await api.patch('/me/cosmetics', { equippedDeckId: deck.id });
                            if (user) {
                              useAuthStore.getState().setUser({ ...user, equippedDeckId: deck.id, equippedDeckName: deck.name } as any);
                            }
                            setShowDeckPicker(false);
                          } catch {
                            // ignore
                          } finally {
                            setEquippingDeckId(null);
                          }
                        }}
                        className={`text-center px-2 py-2 rounded-lg border-2 transition-all flex flex-col items-center disabled:opacity-60 disabled:cursor-not-allowed ${
                          isEquipped
                            ? 'bg-purple-600/40 border-purple-400 text-white'
                            : canEquip
                              ? 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-purple-500/50'
                              : 'bg-gray-700/30 border-gray-700 text-gray-500'
                        }`}
                      >
                        {coverCard ? (
                          <div className="flex-shrink-0 w-14 sm:w-16 aspect-[59/86] rounded overflow-hidden border border-white/20 mb-1.5">
                            <CardImage
                              card={coverCard}
                              className="w-full h-full object-cover"
                              fallback="/images/fundoCarta.webp"
                            />
                          </div>
                        ) : (
                          <div className="flex-shrink-0 w-14 sm:w-16 aspect-[59/86] rounded bg-gray-700 border border-white/20 flex items-center justify-center text-xl mb-1.5">
                            🃏
                          </div>
                        )}
                        <span className="font-semibold text-xs truncate w-full block">{deck.name}</span>
                        <span className="text-[10px] text-white/60">
                          {mainDeckCount} cartas{mainDeckCount < 40 && !isEquipped ? ' (mín. 40)' : ''}
                        </span>
                        {isEquipped && (
                          <span className="text-[10px] text-purple-300 font-medium mt-0.5">{t('randomDuel.equipped')}</span>
                        )}
                        {equippingDeckId === deck.id && !isEquipped && (
                          <span className="text-[10px] text-amber-400 mt-0.5">{t('randomDuel.equipping')}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal: composição do deck anime */}
      {animeDeckPreview && (
        <div
          className="fixed inset-0 duel-modal-scrim z-50 flex items-stretch justify-center p-0 sm:p-2 md:p-3"
          onClick={() => setAnimeDeckPreview(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="anime-deck-preview-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-gray-900 to-black shadow-2xl border-0 sm:border-2 border-purple-500/50 w-full h-full max-h-[100dvh] sm:max-h-[calc(100dvh-1rem)] sm:max-w-[min(100vw-1rem,1400px)] sm:rounded-xl overflow-hidden flex flex-col sm:my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-2 sm:px-4 sm:py-3 border-b border-purple-500/30 flex items-start justify-between gap-2 flex-shrink-0">
              <div className="min-w-0">
                <h2 id="anime-deck-preview-title" className="text-base sm:text-xl font-bold text-white truncate">
                  {animeDeckPreview.name}
                </h2>
                {animeDeckPreview.description ? (
                  <p className="text-xs sm:text-sm text-slate-400 mt-0.5 line-clamp-2 sm:line-clamp-3">{animeDeckPreview.description}</p>
                ) : null}
                <p className="text-[10px] sm:text-xs text-white/50 mt-0.5">
                  {(animeDeckPreview.cards ?? []).reduce((s, c) => s + (c.quantity ?? 1), 0)} cartas no baralho (todas as cópias na grade)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAnimeDeckPreview(null)}
                className="flex-shrink-0 text-gray-400 hover:text-white transition-colors text-2xl font-bold leading-none px-2 py-1"
                aria-label={t('common.close')}
              >
                ×
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 sm:p-3 custom-scrollbar">
              {(() => {
                const entries = animeDeckPreview.cards ?? [];
                const main = entries.filter((e) => !e.isExtraDeck);
                const extra = entries.filter((e) => e.isExtraDeck);
                const mainExpanded = expandAnimeDeckEntries(main);
                const extraExpanded = expandAnimeDeckEntries(extra);
                const gridClass =
                  'grid gap-1 sm:gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(3.25rem,1fr))] sm:[grid-template-columns:repeat(auto-fill,minmax(3.75rem,1fr))] md:[grid-template-columns:repeat(auto-fill,minmax(4.25rem,1fr))]';
                const renderSection = (
                  expanded: AnimeDeckExpandedSlots,
                  title: string,
                  titleClass: string,
                  emptyMsg: string,
                ) => (
                  <div className="mb-3 last:mb-0">
                    <h3 className={`text-xs sm:text-sm font-bold mb-1.5 sticky top-0 z-10 py-1 -mx-1 px-1 bg-gray-950/90 backdrop-blur-sm border-b border-white/5 ${titleClass}`}>
                      {title}{' '}
                      <span className="text-white/45 font-normal">({expanded.length})</span>
                    </h3>
                    {expanded.length === 0 ? (
                      <p className="text-slate-500 text-xs sm:text-sm">{emptyMsg}</p>
                    ) : (
                      <div className={gridClass}>
                        {expanded.map(({ card: c, key }) => (
                          <div
                            key={key}
                            className="rounded-md border border-slate-600/50 bg-slate-800/30 p-0.5 sm:p-1"
                            title={c?.name ?? 'Carta'}
                          >
                            {c ? (
                              <CardImage
                                {...animePreviewCardImageProps}
                                card={c}
                                className="w-full aspect-[59/86] rounded object-cover"
                                fallback="/images/fundoCarta.webp"
                              />
                            ) : (
                              <div className="w-full aspect-[59/86] rounded bg-slate-700 flex items-center justify-center text-sm">?</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
                return (
                  <>
                    {renderSection(mainExpanded, 'Deck principal', 'text-blue-300', 'Nenhuma carta no deck principal.')}
                    {renderSection(extraExpanded, 'Deck adicional', 'text-violet-300', 'Nenhuma carta no deck adicional.')}
                  </>
                );
              })()}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
