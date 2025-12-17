import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSocket } from '../hooks/useSocket';

export default function RandomDuelPage() {
  const { user } = useAuthStore();
  const { isConnected, isSearching, duelFound, searchDuel, cancelSearch, getSocket } = useSocket();
  const [isCreatingDuel, setIsCreatingDuel] = useState(false);
  const handlerRef = useRef<((data: any) => void) | null>(null);
  const isOpeningRef = useRef<boolean>(false);
  
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-4xl w-full text-center">
        {duelFound ? (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="space-y-6"
          >
            <div className="mb-8">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-24 h-24 mx-auto mb-6 bg-green-500/20 rounded-full flex items-center justify-center border-4 border-green-500"
              >
                <span className="text-5xl">⚔️</span>
              </motion.div>
              <h2 className="text-5xl font-bold text-green-400 mb-4 drop-shadow-lg">
                Duelo Encontrado!
              </h2>
              <div className="mb-6">
                <div className="flex flex-col items-center gap-4">
                  {duelFound.opponent?.profileImage && (
                    <div className="relative">
                      <div className="absolute inset-0 bg-red-500 rounded-full blur-xl opacity-50"></div>
                      <img 
                        src={`http://localhost:3000${duelFound.opponent.profileImage}?t=${Date.now()}`}
                        alt={duelFound.opponent?.username || 'Oponente'}
                        className="relative w-24 h-24 rounded-full border-4 border-red-500 shadow-lg object-cover"
                        onError={(e) => {
                          e.currentTarget.src = '/images/default.png';
                        }}
                      />
                    </div>
                  )}
                  <div className="text-center">
                    <p className="text-white text-xl mb-2 font-semibold">Oponente:</p>
                    <p className="text-3xl font-bold text-red-400 drop-shadow-lg">
                      {duelFound.opponent?.clanTag ? `|${duelFound.opponent.clanTag}| ` : ''}
                      {duelFound.opponent?.nickname || duelFound.opponent?.username || 'Oponente'}
                    </p>
                    {duelFound.opponent?.level && (
                      <p className="text-white/80 mt-2 text-lg">Nível: {duelFound.opponent.level} ⭐</p>
                    )}
                  </div>
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
                className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 px-12 py-5 rounded-xl text-2xl font-bold cursor-pointer hover:shadow-lg hover:shadow-purple-500/50 transition-all inline-block text-white"
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
                className="gradient blue-purple px-12 py-4 rounded-lg text-2xl font-bold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed relative z-10"
                style={{ pointerEvents: isCreatingDuel ? 'none' : 'auto' }}
              >
                {isCreatingDuel ? '⏳ Criando Duelo...' : '⚔️ Entrar na Arena de Duelo'}
              </button>
            )}
            <p className="text-slate-500 text-sm mt-4">
              (Abre em nova aba)
            </p>
          </motion.div>
        ) : isSearching ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="space-y-8"
          >
            <div className="relative w-40 h-40 mx-auto mb-8">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="w-full h-full border-8 border-purple-500 border-t-transparent rounded-full"
              />
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <span className="text-6xl">⚔️</span>
              </motion.div>
            </div>
            <div>
              <h2 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
                Procurando Oponente...
              </h2>
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-white/80 text-lg mb-8"
              >
                Aguarde enquanto buscamos um duelista digno...
              </motion.p>
            </div>
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
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Status Conexão */}
            <div className="mb-8">
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

            <div className="mb-10">
              <h1 className="text-6xl md:text-7xl font-bold mb-4">
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  🎲 Random Duel
                </span>
              </h1>
              <p className="text-white/80 text-xl mb-2">
                Encontre um oponente aleatório e prove seu valor!
              </p>
            </div>

            {/* Player Info */}
            <div className="mb-8">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-purple-500 rounded-full blur-xl opacity-50"></div>
                  <img 
                    src={user.profileImage ? `http://localhost:3000${user.profileImage}?t=${Date.now()}` : '/images/default.png'} 
                    alt={user.username}
                    className="relative w-32 h-32 rounded-full border-4 border-purple-500 shadow-lg object-cover"
                    onError={(e) => {
                      e.currentTarget.src = '/images/default.png';
                    }}
                  />
                </div>
                <div className="flex-1 text-center md:text-left">
                  <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                    {user.clanTag ? `|${user.clanTag}| ${user.nickname || user.username}` : (user.nickname || user.username)}
                  </div>
                  <div className="text-white/70 mb-4 text-lg">Nível {user.level || 1} ⭐ Score: {user.totalScore?.toFixed(1) || 0}</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg p-4">
                      <div className="text-white/70 text-sm mb-1">V/D Season</div>
                      <div className="text-xl font-bold">
                        <span className="text-green-400">{user.winsSeason || 0}</span> / <span className="text-red-400">{user.lossesSeason || 0}</span>
                      </div>
                    </div>
                    <div className="rounded-lg p-4">
                      <div className="text-white/70 text-sm mb-1">V/D Geral</div>
                      <div className="text-xl font-bold">
                        <span className="text-green-400">{user.winsGeral || 0}</span> / <span className="text-red-400">{user.lossesGeral || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (user?.id) {
                  const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
                  searchDuel(userId);
                }
              }}
              disabled={!isConnected}
              className="bg-gradient-to-r from-red-600 via-orange-600 to-red-600 px-12 py-5 rounded-xl text-2xl font-bold disabled:opacity-50 disabled:cursor-not-allowed text-white hover:shadow-lg hover:shadow-red-500/50 transition-all mb-8"
            >
              🎮 Procurar Duelo
            </motion.button>

            {/* Estatísticas */}
            <div className="mt-8 pt-8">
              <div className="grid grid-cols-3 gap-6 text-center">
                <div className="rounded-xl p-4">
                  <div className="text-3xl font-bold text-blue-400 mb-1">{user.winsGeral || 0}</div>
                  <div className="text-white/70 text-sm">Vitórias</div>
                </div>
                <div className="rounded-xl p-4">
                  <div className="text-3xl font-bold text-red-400 mb-1">{user.lossesGeral || 0}</div>
                  <div className="text-white/70 text-sm">Derrotas</div>
                </div>
                <div className="rounded-xl p-4">
                  <div className="text-3xl font-bold text-purple-400 mb-1">
                    {(() => {
                      const wins = user.winsGeral || 0;
                      const losses = user.lossesGeral || 0;
                      const total = wins + losses;
                      return total > 0 ? Math.round((wins / total) * 100) : 0;
                    })()}%
                  </div>
                  <div className="text-white/70 text-sm">Taxa de Vitória</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
