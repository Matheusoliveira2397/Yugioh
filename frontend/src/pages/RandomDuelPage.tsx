import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSocket } from '../hooks/useSocket';
import { getImageUrl, getProfileImageUrl, DEFAULT_PROFILE_IMAGE_PATH } from '../utils/imageUrl';
import api from '../api/axios';
import CardImage from '../components/CardImage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface AnimeDeckOption {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  coverCard?: { id: string; name: string; cardImage?: string; idCarta?: string } | null;
  cards?: Array<{ quantity?: number }>;
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
  const { user } = useAuthStore();
  const { isConnected, isSearching, duelFound, duelError, clearDuelFound, clearDuelError, searchDuel, cancelSearch, getSocket } = useSocket();
  const [isCreatingDuel, setIsCreatingDuel] = useState(false);
  const [levelRange, setLevelRange] = useState<LevelRange | null>(null);
  const [searchElapsedSeconds, setSearchElapsedSeconds] = useState(0);
  const [duelMode, setDuelMode] = useState<'normal' | 'anime'>('normal');
  const [animeDecks, setAnimeDecks] = useState<AnimeDeckOption[]>([]);
  const [selectedAnimeDeckId, setSelectedAnimeDeckId] = useState<string | null>(null);
  const [animeDecksLoading, setAnimeDecksLoading] = useState(false);
  const [myDecks, setMyDecks] = useState<MyDeckOption[]>([]);
  const [myDecksLoading, setMyDecksLoading] = useState(false);
  const [equippingDeckId, setEquippingDeckId] = useState<string | null>(null);
  const [showDeckPicker, setShowDeckPicker] = useState(false);
  const [randomStats, setRandomStats] = useState<{ total: number; wins: number; losses: number } | null>(null);
  const [isRandomAnimeEnabled, setIsRandomAnimeEnabled] = useState(true);
  const handlerRef = useRef<((data: any) => void) | null>(null);
  const isOpeningRef = useRef<boolean>(false);
  const searchStartTimeRef = useRef<number | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Estatísticas de duelos no Random (total, V/D, %)
  useEffect(() => {
    if (!user?.id) return;
    api
      .get<{ total: number; wins: number; losses: number }>('/duels/stats/random/my')
      .then((res) => {
        if (res.data && typeof (res.data as any).total === 'number') {
          setRandomStats({ total: (res.data as any).total, wins: (res.data as any).wins ?? 0, losses: (res.data as any).losses ?? 0 });
        }
      })
      .catch(() => setRandomStats({ total: 0, wins: 0, losses: 0 }));
  }, [user?.id]);

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

  // Se a aba for desativada no admin, forçar retorno ao modo normal
  useEffect(() => {
    if (!isRandomAnimeEnabled && duelMode === 'anime') {
      setDuelMode('normal');
    }
  }, [isRandomAnimeEnabled, duelMode]);

  // Buscar decks do usuário quando modo Random Duel normal
  useEffect(() => {
    if (duelMode !== 'normal') return;
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

  if (!user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="max-w-4xl w-full text-center py-2 sm:py-4">
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
                onClick={() => { clearDuelError(); if (user?.id) searchDuel(user.id, duelMode === 'anime' && selectedAnimeDeckId ? { animeDeckId: selectedAnimeDeckId } : undefined); }}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium"
              >
                Tentar novamente
              </button>
              <button
                type="button"
                onClick={clearDuelError}
                className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        )}
        <AnimatePresence mode="wait">
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
                Partida encontrada
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
                    src="/images/Icones/Random Duel.png" 
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
                  Duelo Encontrado!
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
                    <p className="text-white text-base sm:text-lg mb-1 font-semibold">Oponente:</p>
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
                        console.log(`⚠️ [RandomDuelPage] Outra aba (${lockerTabId}) já está abrindo o duelo ${duelId}. Esta aba ignorando.`);
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
                ✕ Fechar e procurar de novo
              </button>
            </div>
          </motion.div>
          </motion.div>
        ) : isSearching ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="space-y-3 sm:space-y-4 w-full"
          >
            {/* Logo durante busca */}
            <div className="flex justify-center mb-2 sm:mb-4">
              <motion.div
                animate={{ 
                  scale: [1, 1.05, 1],
                  filter: ['brightness(1)', 'brightness(1.2)', 'brightness(1)']
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="relative"
              >
                <motion.div
                  animate={{ 
                    boxShadow: [
                      '0 0 30px rgba(139, 92, 246, 0.4)',
                      '0 0 50px rgba(139, 92, 246, 0.6)',
                      '0 0 30px rgba(139, 92, 246, 0.4)'
                    ]
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 bg-purple-500/40 rounded-2xl blur-2xl"
                />
                <img 
                  src="/images/Icones/Random Duel.png" 
                  alt="Random Duel"
                  className="relative w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 object-contain drop-shadow-2xl"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </motion.div>
            </div>

            {/* Animação de Loading */}
            <div className="relative w-24 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36 mx-auto mb-3 sm:mb-4">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="w-full h-full border-4 sm:border-[6px] md:border-8 border-purple-500 border-t-transparent rounded-full"
              />
              <motion.div
                animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <span className="text-4xl sm:text-5xl md:text-6xl">⚔️</span>
              </motion.div>
            </div>

            {/* Texto */}
            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                Procurando Oponente...
              </h2>
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-white/80 text-sm sm:text-base md:text-lg mb-2"
              >
                Aguarde enquanto buscamos um duelista digno...
              </motion.p>
              {/* Contador de tempo */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-black/30 border border-purple-500/40 mb-4">
                <span className="text-white/70 text-sm font-medium">Tempo:</span>
                <span className="text-2xl sm:text-3xl font-mono font-bold tabular-nums text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]">
                  {Math.floor(searchElapsedSeconds / 60)}:{(searchElapsedSeconds % 60).toString().padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Botão Cancelar */}
            <div className="flex justify-center">
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (user?.id) {
                    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
                    cancelSearch(userId);
                  }
                }}
                className="bg-gradient-to-r from-red-600 to-pink-600 px-8 py-3 rounded-xl font-bold text-white hover:shadow-lg hover:shadow-red-500/50 transition-all"
              >
                Cancelar Busca
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full"
          >
            {/* Header com Logo e Status */}
            <div className="mb-4 sm:mb-6">
              {/* Header do Random Duel */}
              <div className="flex flex-col items-center mb-3 sm:mb-4">
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-white/90 text-sm sm:text-base md:text-lg text-center max-w-md px-2"
                >
                  Encontre um oponente aleatório e prove seu valor!
                </motion.p>
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mt-2 text-xs sm:text-sm text-purple-200/90 text-center"
                >
                  Deck equipado: {user.equippedDeckName || 'Nenhum deck equipado'}
                </motion.p>
              </div>

              {/* Status Conexão */}
              <div className="flex justify-center mb-3 sm:mb-4">
                <div className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full backdrop-blur-sm border ${
                  isConnected ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-red-500/20 text-red-400 border-red-500/50'
                }`}>
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} 
                  />
                  <span className="font-semibold">{isConnected ? 'Conectado' : 'Desconectado'}</span>
                </div>
              </div>

              {/* Modo: Random Duel vs Random Duel: Animes Deck */}
              <div className="flex justify-center gap-2 mb-3 sm:mb-4">
                <button
                  type="button"
                  onClick={() => setDuelMode('normal')}
                  className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                    duelMode === 'normal'
                      ? 'bg-purple-600 text-white border-2 border-purple-400'
                      : 'bg-gray-700/50 text-gray-400 border-2 border-transparent hover:border-gray-500'
                  }`}
                >
                  🎲 Random Duel
                </button>
                {isRandomAnimeEnabled && (
                  <button
                    type="button"
                    onClick={() => setDuelMode('anime')}
                    className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                      duelMode === 'anime'
                        ? 'bg-purple-600 text-white border-2 border-purple-400'
                        : 'bg-gray-700/50 text-gray-400 border-2 border-transparent hover:border-gray-500'
                    }`}
                  >
                    🎬 Animes Deck
                  </button>
                )}
              </div>

              {/* Se modo Animes Deck: escolher deck */}
              {duelMode === 'anime' && (
                <div className="mb-4 sm:mb-6 p-3 sm:p-4 rounded-xl bg-gray-800/50 border border-purple-500/30">
                  <p className="text-white/90 text-sm sm:text-base font-medium mb-2">Escolha um deck para duelar:</p>
                  {animeDecksLoading ? (
                    <p className="text-gray-400 text-sm">Carregando decks...</p>
                  ) : animeDecks.length === 0 ? (
                    <p className="text-amber-400 text-sm">Nenhum deck anime disponível. Crie decks no painel admin.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 max-h-56 overflow-y-auto">
                      {animeDecks.map((deck) => (
                        <button
                          key={deck.id}
                          type="button"
                          onClick={() => setSelectedAnimeDeckId(deck.id)}
                          className={`text-center px-2 py-2 rounded-lg border-2 transition-all flex flex-col items-center ${
                            selectedAnimeDeckId === deck.id
                              ? 'bg-purple-600/40 border-purple-400 text-white'
                              : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-purple-500/50'
                          }`}
                        >
                          {deck.coverCard ? (
                            <div className="flex-shrink-0 w-14 sm:w-16 aspect-[59/86] rounded overflow-hidden border border-white/20 mb-1.5">
                              <CardImage
                                card={deck.coverCard}
                                className="w-full h-full object-cover"
                                fallback="/images/fundoCarta.webp"
                              />
                            </div>
                          ) : (
                            <div className="flex-shrink-0 w-14 sm:w-16 aspect-[59/86] rounded bg-gray-700 border border-white/20 flex items-center justify-center text-xl mb-1.5">🃏</div>
                          )}
                          <span className="font-semibold text-xs truncate w-full block">{deck.name}</span>
                          {deck.cards && (
                            <span className="text-[10px] text-white/60">
                              {deck.cards.reduce((s, c) => s + (c.quantity ?? 1), 0)} cartas
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Card do duelista */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-3 sm:mb-4 mx-auto w-full max-w-sm rounded-xl border border-purple-500/25 bg-gradient-to-br from-slate-900/90 via-gray-900/80 to-slate-950/90 backdrop-blur-md shadow-xl shadow-purple-950/20 overflow-hidden"
            >
              <div className="px-3 py-2 sm:px-4 sm:py-2.5 border-b border-white/5 bg-purple-950/20">
                <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-purple-300/90">
                  Seu duelista
                </span>
              </div>
              <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
                {/* Avatar + identidade (sempre em linha em telas médias+) */}
                <div className="flex flex-row gap-3 sm:gap-4 items-center text-left">
                  <div className="relative flex-shrink-0">
                    <motion.div
                      animate={{
                        scale: [1, 1.04, 1],
                        boxShadow: [
                          '0 0 18px rgba(139, 92, 246, 0.25)',
                          '0 0 28px rgba(139, 92, 246, 0.45)',
                          '0 0 18px rgba(139, 92, 246, 0.25)',
                        ],
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute -inset-1 rounded-full bg-purple-500/35 blur-md"
                    />
                    <img
                      src={getProfileImageUrl(user.profileImage)}
                      alt={user.nickname}
                      className="relative h-[4.5rem] w-[4.5rem] sm:h-[5.25rem] sm:w-[5.25rem] rounded-full border-2 border-purple-400/80 object-cover shadow-lg ring-2 ring-black/40"
                      onError={(e) => {
                        e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg sm:text-xl font-bold leading-tight text-white break-words">
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
                    {levelRange && (
                      <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-purple-500/35 bg-purple-500/10 px-2 py-1">
                        <span className="text-[10px] sm:text-xs font-medium text-white/55">Faixa de nível</span>
                        <span className="truncate text-xs sm:text-sm font-bold text-purple-200">{levelRange.name}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Deck + botão procurar (botão fora do card do deck, à direita, maior) */}
                {duelMode === 'normal' ? (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 p-2">
                      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-white/45">
                        Deck para este duelo
                      </p>
                      {myDecksLoading ? (
                        <p className="text-gray-400 text-xs py-1.5">Carregando decks…</p>
                      ) : myDecks.length === 0 ? (
                        <p className="text-amber-400/90 text-xs py-1.5">Crie um deck no Deck Builder.</p>
                      ) : (
                        <div className="flex items-center gap-2">
                          {(() => {
                            const equippedDeck = myDecks.find((d) => d.id === user?.equippedDeckId);
                            const mainDeckCount = equippedDeck ? (equippedDeck.cards?.filter((c) => !c.isExtraDeck).length ?? 0) : 0;
                            const coverCard = equippedDeck
                              ? (equippedDeck.coverCard ?? equippedDeck.cards?.[0]?.card ?? null)
                              : null;
                            const ok = equippedDeck && mainDeckCount >= 40;
                            return (
                              <>
                                <div
                                  className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg border px-2 py-1.5 ${
                                    ok
                                      ? 'border-purple-400/50 bg-purple-600/15'
                                      : 'border-dashed border-gray-600 bg-gray-800/30'
                                  }`}
                                >
                                  {ok && coverCard ? (
                                    <div className="relative w-[3.25rem] shrink-0 overflow-hidden rounded border border-white/15 bg-black/40 aspect-[59/86] sm:w-[3.625rem]">
                                      <CardImage
                                        card={coverCard}
                                        className="absolute inset-0 h-full w-full min-h-0"
                                        style={{ backgroundSize: 'cover', backgroundPosition: 'top center' }}
                                        fallback="/images/fundoCarta.webp"
                                      />
                                    </div>
                                  ) : ok ? (
                                    <div className="flex w-[3.25rem] shrink-0 items-center justify-center rounded border border-white/10 bg-gray-700 text-base aspect-[59/86] sm:w-[3.625rem]">
                                      🃏
                                    </div>
                                  ) : null}
                                  <div className="min-w-0 w-full px-0.5 text-center">
                                    {ok && equippedDeck ? (
                                      <p className="line-clamp-2 text-xs font-semibold leading-tight text-white sm:text-sm">
                                        {equippedDeck.name}
                                      </p>
                                    ) : (
                                      <p className="text-[11px] leading-snug text-gray-400 sm:text-xs">
                                        {equippedDeck && mainDeckCount < 40
                                          ? `"${equippedDeck.name}" precisa de no mínimo 40 cartas.`
                                          : 'Nenhum deck equipado.'}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setShowDeckPicker(true)}
                                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-purple-500/45 bg-purple-500/10 text-lg font-bold leading-none text-purple-200 transition-all hover:border-purple-400 hover:bg-purple-500/20 sm:h-11 sm:w-11"
                                  title="Trocar deck"
                                  aria-label="Trocar deck equipado"
                                >
                                  +
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.35 }}
                      className="flex shrink-0 flex-col items-center justify-center self-center"
                    >
                      <motion.button 
                        type="button"
                        whileHover={isConnected ? { scale: 1.03 } : {}}
                        whileTap={isConnected ? { scale: 0.98 } : {}}
                        onClick={() => {
                          if (user?.id) {
                            const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
                            searchDuel(userId, undefined);
                          }
                        }}
                        disabled={!isConnected}
                        className="border-0 bg-transparent p-0 shadow-none transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 rounded-xl"
                        aria-label="Procurar duelo"
                      >
                        <img
                          src="/images/ProcurarDuelo.png"
                          alt=""
                          className="block h-auto w-[10rem] max-w-[42vw] object-contain select-none drop-shadow-[0_6px_24px_rgba(0,0,0,0.45)] sm:w-[12rem] md:w-[13.5rem]"
                          draggable={false}
                        />
                      </motion.button>
                    </motion.div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 p-2">
                      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-white/45">
                        Deck anime
                      </p>
                      {(() => {
                        const sel = animeDecks.find((d) => d.id === selectedAnimeDeckId);
                        if (!sel) {
                          return <p className="text-xs text-gray-400">Selecione um deck na lista acima.</p>;
                        }
                        const cc = sel.coverCard;
                        return (
                          <div className="flex flex-col items-center gap-1 py-0.5 text-center">
                            {cc ? (
                              <div className="relative w-[3.25rem] shrink-0 overflow-hidden rounded border border-white/15 bg-black/40 aspect-[59/86] sm:w-[3.625rem]">
                                <CardImage
                                  card={cc}
                                  className="absolute inset-0 h-full w-full min-h-0"
                                  style={{ backgroundSize: 'cover', backgroundPosition: 'top center' }}
                                  fallback="/images/fundoCarta.webp"
                                />
                              </div>
                            ) : (
                              <div className="flex w-[3.25rem] shrink-0 items-center justify-center rounded border border-white/10 bg-gray-700 text-base aspect-[59/86] sm:w-[3.625rem]">
                                🃏
                              </div>
                            )}
                            <p className="line-clamp-2 w-full text-xs font-semibold leading-tight text-white sm:text-sm">
                              {sel.name}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.35 }}
                      className="flex shrink-0 flex-col items-center justify-center self-center"
                    >
                      <motion.button 
                        type="button"
                        whileHover={isConnected && !!selectedAnimeDeckId && animeDecks.length > 0 ? { scale: 1.03 } : {}}
                        whileTap={isConnected && !!selectedAnimeDeckId && animeDecks.length > 0 ? { scale: 0.98 } : {}}
                        onClick={() => {
                          if (user?.id) {
                            const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
                            const opts = selectedAnimeDeckId ? { animeDeckId: selectedAnimeDeckId } : undefined;
                            searchDuel(userId, opts);
                          }
                        }}
                        disabled={!isConnected || !selectedAnimeDeckId || animeDecks.length === 0}
                        className="border-0 bg-transparent p-0 shadow-none transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 rounded-xl"
                        aria-label="Procurar duelo"
                      >
                        <img
                          src="/images/ProcurarDuelo.png"
                          alt=""
                          className="block h-auto w-[10rem] max-w-[42vw] object-contain select-none drop-shadow-[0_6px_24px_rgba(0,0,0,0.45)] sm:w-[12rem] md:w-[13.5rem]"
                          draggable={false}
                        />
                      </motion.button>
                    </motion.div>
                  </div>
                )}

                {/* Estatísticas Random */}
                <div>
                  <p className="mb-2 text-[10px] sm:text-xs font-medium uppercase tracking-wide text-white/45">
                    Histórico no Random
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-2 text-center sm:px-2.5 sm:py-2.5"
                    >
                      <span className="block text-[10px] font-medium text-amber-200/70">Duelos</span>
                      <span className="text-base font-bold tabular-nums text-amber-300 sm:text-lg">
                        {randomStats?.total ?? 0}
                      </span>
                    </motion.div>
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-center sm:px-2.5 sm:py-2.5"
                    >
                      <span className="block text-[10px] font-medium text-white/55">Vit / Der</span>
                      <span className="text-sm font-bold tabular-nums sm:text-base">
                        <span className="text-emerald-400">{randomStats?.wins ?? 0}</span>
                        <span className="text-white/35"> / </span>
                        <span className="text-rose-400">{randomStats?.losses ?? 0}</span>
                      </span>
                    </motion.div>
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      className="rounded-lg border border-purple-500/25 bg-purple-500/10 px-2 py-2 text-center sm:px-2.5 sm:py-2.5"
                    >
                      <span className="block text-[10px] font-medium text-purple-200/70">Aproveit.</span>
                      <span className="text-base font-bold tabular-nums text-purple-200 sm:text-lg">
                        {(() => {
                          const total = randomStats?.total ?? 0;
                          const wins = randomStats?.wins ?? 0;
                          return total > 0 ? Math.round((wins / total) * 100) : 0;
                        })()}
                        %
                      </span>
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.div>

          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* Modal: escolher deck para duelar */}
      {showDeckPicker && duelMode === 'normal' && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
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
                <p className="text-gray-400 text-sm text-center py-4">Carregando...</p>
              ) : myDecks.length === 0 ? (
                <p className="text-amber-400 text-sm text-center py-4">Nenhum deck. Crie um no Deck Builder.</p>
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
                          <span className="text-[10px] text-purple-300 font-medium mt-0.5">Equipado</span>
                        )}
                        {equippingDeckId === deck.id && !isEquipped && (
                          <span className="text-[10px] text-amber-400 mt-0.5">Equipando...</span>
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
    </div>
  );
}
