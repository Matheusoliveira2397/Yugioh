import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSocket } from '../hooks/useSocket';
import { getImageUrl } from '../utils/imageUrl';
import { getDivisionDisplayName, getDivisionImagePath } from '../utils/divisionDisplay';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Função para obter o caminho da imagem da divisão (compatível com uso local por estilos)
const getDivisionImage = (division: string): string | null => {
  return getDivisionImagePath(division);
};

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

export default function RandomDuelPage() {
  const { user } = useAuthStore();
  const { isConnected, isSearching, duelFound, duelError, clearDuelFound, clearDuelError, searchDuel, cancelSearch, getSocket } = useSocket();
  const [isCreatingDuel, setIsCreatingDuel] = useState(false);
  const [levelRange, setLevelRange] = useState<LevelRange | null>(null);
  const [searchElapsedSeconds, setSearchElapsedSeconds] = useState(0);
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
                onClick={() => { clearDuelError(); if (user?.id) searchDuel(user.id); }}
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
                  {duelFound.opponent?.profileImage && (
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
                        src={getImageUrl(duelFound.opponent.profileImage)}
                        alt={duelFound.opponent?.nickname || 'Oponente'}
                        className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 sm:border-4 border-red-500 shadow-lg object-cover"
                        onError={(e) => {
                          e.currentTarget.src = '/images/default.png';
                        }}
                      />
                    </motion.div>
                  )}
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
              {/* Logo Random Duel */}
              <div className="flex flex-col items-center mb-3 sm:mb-4">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="relative mb-2 sm:mb-3"
                >
                  <motion.div
                    animate={{ 
                      boxShadow: [
                        '0 0 20px rgba(139, 92, 246, 0.3)',
                        '0 0 40px rgba(139, 92, 246, 0.5)',
                        '0 0 20px rgba(139, 92, 246, 0.3)'
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 bg-purple-500/30 rounded-2xl blur-2xl"
                  />
                  <img 
                    src="/images/Icones/Random Duel.png" 
                    alt="Random Duel"
                    className="relative w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 object-contain drop-shadow-2xl"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </motion.div>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-white/90 text-sm sm:text-base md:text-lg text-center max-w-md px-2"
                >
                  Encontre um oponente aleatório e prove seu valor!
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
            </div>

            {/* Player Info Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-4 sm:mb-6 bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5 border border-purple-500/20 shadow-xl"
            >
              <div className="flex flex-col md:flex-row items-center md:items-start gap-3 sm:gap-4">
                <div className="relative flex-shrink-0">
                  <motion.div
                    animate={{ 
                      scale: [1, 1.05, 1],
                      boxShadow: [
                        '0 0 20px rgba(139, 92, 246, 0.3)',
                        '0 0 30px rgba(139, 92, 246, 0.5)',
                        '0 0 20px rgba(139, 92, 246, 0.3)'
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 bg-purple-500 rounded-full blur-xl opacity-50"
                  />
                  <img 
                    src={getImageUrl(user.profileImage)} 
                    alt={user.nickname}
                    className="relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full border-2 sm:border-4 border-purple-500 shadow-lg object-cover"
                    onError={(e) => {
                      e.currentTarget.src = '/images/default.png';
                    }}
                  />
                </div>
                <div className="flex-1 text-center md:text-left min-w-0">
                  <div className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-1">
                    {user.clanTag ? `|${user.clanTag}| ${user.nickname}` : user.nickname}
                  </div>
                  <div className="text-white/70 mb-2 sm:mb-3 text-sm sm:text-base">
                    Nível {user.level || 1} ⭐ Score: {user.totalScore?.toFixed(1) || 0}
                  </div>
                  {levelRange && (
                    <div className="mb-2 sm:mb-3">
                      <div className="inline-flex items-center gap-2 px-2 sm:px-3 py-1.5 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg border border-purple-500/30 backdrop-blur-sm">
                        <span className="text-white/70 text-xs sm:text-sm font-medium">Faixa:</span>
                        <span className="text-purple-300 font-bold text-sm sm:text-base">{levelRange.name}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Ranking e Elo */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-2 sm:mb-3">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-lg p-2 sm:p-3 border border-blue-500/30 backdrop-blur-sm"
                    >
                      <div className="text-white/70 text-[10px] sm:text-xs mb-0.5 font-medium">Rank Geral</div>
                      <div className="text-lg sm:text-xl md:text-2xl font-bold text-blue-400">
                        #{user.generalRank || user.globalRank || 'N/A'}
                      </div>
                    </motion.div>
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-lg p-2 sm:p-3 border border-purple-500/30 backdrop-blur-sm"
                    >
                      <div className="text-white/70 text-[10px] sm:text-xs mb-0.5 font-medium">Rank Season</div>
                      <div className="text-lg sm:text-xl md:text-2xl font-bold text-purple-400">
                        #{user.seasonRank || 'N/A'}
                      </div>
                    </motion.div>
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      className={`rounded-lg p-2 sm:p-3 border backdrop-blur-sm ${
                        (() => {
                          const div = (user.division || 'Bronze').toUpperCase();
                          if (div === 'BRONZE') return 'bg-gradient-to-br from-orange-500/20 to-orange-600/20 border-orange-500/30';
                          if (div === 'SILVER') return 'bg-gradient-to-br from-gray-400/20 to-gray-500/20 border-gray-400/30';
                          if (div === 'GOLD') return 'bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 border-yellow-500/30';
                          if (div === 'PLATINUM') return 'bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 border-cyan-500/30';
                          if (div === 'DIAMOND') return 'bg-gradient-to-br from-blue-500/20 to-blue-600/20 border-blue-500/30';
                          if (div === 'MASTER') return 'bg-gradient-to-br from-purple-500/20 to-purple-600/20 border-purple-500/30';
                          if (div === 'LEGENDARY') return 'bg-gradient-to-br from-red-500/20 to-red-600/20 border-red-500/30';
                          return 'bg-gradient-to-br from-orange-500/20 to-orange-600/20 border-orange-500/30';
                        })()
                      }`}
                    >
                      <div className="text-white/70 text-[10px] sm:text-xs mb-0.5 font-medium">Elo</div>
                      <div className="flex items-center justify-center gap-1 sm:gap-2">
                        {(() => {
                          const divisionImage = getDivisionImage(user.division || 'Bronze');
                          const div = (user.division || 'Bronze').trim().toUpperCase();
                          const divNorm = div === 'PRATA' ? 'SILVER' : div === 'OURO' ? 'GOLD' : div === 'DIAMANTE' ? 'DIAMOND' : div === 'MESTRE' ? 'MASTER' : div === 'DESAFIANTE' ? 'LEGENDARY' : div === 'PLATINA' ? 'PLATINUM' : div;
                          const textColor = 
                            divNorm === 'BRONZE' ? 'text-orange-400' :
                            divNorm === 'SILVER' ? 'text-gray-300' :
                            divNorm === 'GOLD' ? 'text-yellow-400' :
                            divNorm === 'PLATINUM' ? 'text-cyan-400' :
                            divNorm === 'DIAMOND' ? 'text-blue-400' :
                            divNorm === 'MASTER' ? 'text-purple-400' :
                            divNorm === 'LEGENDARY' ? 'text-red-400' :
                            'text-orange-400';
                          const divisionLabel = getDivisionDisplayName(user.division || 'Bronze');
                          return (
                            <>
                              {divisionImage && (
                                <img 
                                  src={divisionImage} 
                                  alt={divisionLabel}
                                  className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 object-contain drop-shadow-lg"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              )}
                              <span className={`text-sm sm:text-lg md:text-xl font-bold ${textColor}`}>
                                {divisionLabel}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </motion.div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="bg-gray-800/50 rounded-lg p-2 sm:p-3 border border-purple-500/20">
                      <div className="text-white/70 text-xs mb-0.5">V/D Season</div>
                      <div className="text-base sm:text-lg font-bold">
                        <span className="text-green-400">{user.winsSeason || 0}</span> / <span className="text-red-400">{user.lossesSeason || 0}</span>
                      </div>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-2 sm:p-3 border border-purple-500/20">
                      <div className="text-white/70 text-xs mb-0.5">V/D Geral</div>
                      <div className="text-base sm:text-lg font-bold">
                        <span className="text-green-400">{user.winsGeral || 0}</span> / <span className="text-red-400">{user.lossesGeral || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Botão Principal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="flex justify-center mb-4 sm:mb-6"
            >
              <motion.button 
                whileHover={isConnected ? { scale: 1.03 } : {}}
                whileTap={isConnected ? { scale: 0.98 } : {}}
                onClick={() => {
                  if (user?.id) {
                    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
                    searchDuel(userId);
                  }
                }}
                disabled={!isConnected}
                className="group relative px-8 sm:px-12 md:px-14 py-4 sm:py-5 rounded-xl font-bold text-lg sm:text-xl md:text-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 overflow-hidden border-2 border-amber-500/80 bg-gradient-to-b from-[#1c0f0f] to-[#2a1515] text-amber-400 hover:border-amber-400 hover:shadow-[0_0_24px_rgba(251,191,36,0.25)] hover:text-amber-300"
              >
                <span className="relative z-10 flex items-center justify-center gap-2 sm:gap-3">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4l16 16M20 4L4 20" />
                  </svg>
                  Procurar Duelo
                </span>
              </motion.button>
            </motion.div>

            {/* Estatísticas */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-4 pt-4 sm:mt-6 sm:pt-6 border-t border-purple-500/20"
            >
              <h3 className="text-center text-white/70 text-sm sm:text-base font-semibold mb-3 sm:mb-4">Estatísticas Gerais</h3>
              <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-blue-500/30 backdrop-blur-sm"
                >
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-blue-400 mb-0.5 sm:mb-1">{user.winsGeral || 0}</div>
                  <div className="text-white/80 text-xs sm:text-sm font-medium">Vitórias</div>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="bg-gradient-to-br from-red-500/20 to-red-600/20 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-red-500/30 backdrop-blur-sm"
                >
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-red-400 mb-0.5 sm:mb-1">{user.lossesGeral || 0}</div>
                  <div className="text-white/80 text-xs sm:text-sm font-medium">Derrotas</div>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-purple-500/30 backdrop-blur-sm"
                >
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-purple-400 mb-0.5 sm:mb-1">
                    {(() => {
                      const wins = user.winsGeral || 0;
                      const losses = user.lossesGeral || 0;
                      const total = wins + losses;
                      return total > 0 ? Math.round((wins / total) * 100) : 0;
                    })()}%
                  </div>
                  <div className="text-white/80 text-xs sm:text-sm font-medium">Taxa de Vitória</div>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
}
