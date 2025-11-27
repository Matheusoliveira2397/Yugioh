import React, { useState, useEffect, useRef } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import { useSocket } from '../hooks/useSocket';
import DuelChat from '../components/duel/DuelChat';
import DuelLogs from '../components/duel/DuelLogs';
import DuelField from '../components/duel/DuelField';
import CardImage from '../components/CardImage';

interface DuelData {
  id: string;
  player1: any;
  player2: any;
  player1LifePoints: number;
  player2LifePoints: number;
  currentTurn: number;
  currentPhase?: string;
  status: string;
  turnTime?: number; // Tempo do turno em segundos (limite)
  turnTimeRemaining?: number; // Tempo restante calculado pelo backend
  turnStartedAt?: string | Date; // Timestamp de quando o turno começou
  player1Field?: {
    deck: any[];
    hand: any[];
    graveyard: any[];
  };
  player2Field?: {
    deck: any[];
    hand: any[];
    graveyard: any[];
  };
}

const DuelArena: React.FC = () => {
  const { duelId } = useParams();
  const { user, token } = useAuthStore();
  const { duelFound, chatMessages, duelLogs, currentTurn, duelUpdate, sendChatMessage, joinDuelRoom, endTurn, performAction, getSocket } = useSocket();
  
  // Log inicial removido para evitar spam no console
  const [duelData, setDuelData] = useState<DuelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [myLifePoints, setMyLifePoints] = useState(8000);
  const [opponentLifePoints, setOpponentLifePoints] = useState(8000);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<string>('DRAW');
  const [turnTimeLeft, setTurnTimeLeft] = useState(90); // Timer do turno
  const [turnTimer, setTurnTimer] = useState<NodeJS.Timeout | null>(null);
  const [timeExpired, setTimeExpired] = useState(false); // Indica se o tempo do oponente expirou
  const [turnTimeLimit, setTurnTimeLimit] = useState(90); // Limite de tempo do turno (vem do banco)
  const [turnStartedAt, setTurnStartedAt] = useState<Date | null>(null); // Timestamp de quando o turno começou
  const [duelTime, setDuelTime] = useState(0); // Tempo total do duelo em segundos
  const [duelStartTime, setDuelStartTime] = useState<number | null>(null); // Timestamp de quando o duelo começou
  
  // Refs para valores que precisamos no interval sem causar re-renders
  const isMyTurnRef = useRef(false);
  const duelIdRef = useRef<string | undefined>(duelId);
  const userIdRef = useRef<number | undefined>(user?.id);
  const turnStartedAtRef = useRef<Date | null>(null);
  const turnTimeLimitRef = useRef<number>(90);
  
  // Sistema de mão e deck - carregados do backend
  const [myHand, setMyHand] = useState<any[]>([]);
  const [myDeck, setMyDeck] = useState<any[]>([]);
  const [opponentHand, setOpponentHand] = useState<any[]>([]);
  const [opponentDeck, setOpponentDeck] = useState<any[]>([]);
  
  // Estado para controlar qual carta está selecionada para colocar no campo
  const [selectedCardForField, setSelectedCardForField] = useState<any | null>(null);
  // Estado para controlar qual carta está com zoom
  const [zoomedCard, setZoomedCard] = useState<any | null>(null);
  
  // Estado para armazenar as cartas no campo (monstros)
  const [myMonsters, setMyMonsters] = useState<(any | null)[]>(Array(5).fill(null));
  const [opponentMonsters, setOpponentMonsters] = useState<(any | null)[]>(Array(5).fill(null));
  
  // Estado para armazenar as cartas no campo (spell/trap)
  const [mySpellTraps, setMySpellTraps] = useState<(any | null)[]>(Array(5).fill(null));
  const [opponentSpellTraps, setOpponentSpellTraps] = useState<(any | null)[]>(Array(5).fill(null));

  // Carregar dados do duelo via WebSocket (INSTANTÂNEO - sem requisições HTTP pesadas)
  // Usar useRef para evitar múltiplas execuções
  const hasInitializedRef = useRef(false);
  
  useEffect(() => {
    // Evitar múltiplas inicializações
    if (hasInitializedRef.current) {
      return;
    }
    
    if (!duelId || !user) {
      setLoading(false);
      return;
    }

    // Handler para receber dados do duelo via WebSocket
    const handleDuelUpdate = (data: any) => {
      
      if (!data || !data.id) {
        console.error('❌ [DuelArena] Dados inválidos recebidos!');
        setError('Dados do duelo inválidos');
        setLoading(false);
        return;
      }
      
      setDuelData(data);
      
      // Configurar life points, turno, fase e campos
      const isPlayer1 = data.player1Id === user.id;
      setMyLifePoints(isPlayer1 ? data.player1LifePoints : data.player2LifePoints);
      setOpponentLifePoints(isPlayer1 ? data.player2LifePoints : data.player1LifePoints);
      setIsMyTurn(isPlayer1 ? data.currentTurn === 1 : data.currentTurn === 2);
      if (data.currentPhase) {
        setCurrentPhase(data.currentPhase);
      }
      
      // Carregar tempo do duelo
      if (data.duelTime !== undefined) {
        setDuelTime(data.duelTime);
      } else if (data.createdAt) {
        // Calcular tempo baseado no createdAt se duelTime não estiver disponível
        const createdAt = new Date(data.createdAt);
        const now = new Date();
        const elapsedSeconds = Math.floor((now.getTime() - createdAt.getTime()) / 1000);
        setDuelTime(elapsedSeconds);
        setDuelStartTime(createdAt.getTime());
      }
      
      // Carregar tempo do turno do banco de dados
      if (data.turnTime !== undefined && data.turnTime > 0) {
        setTurnTimeLimit(data.turnTime);
      } else {
        // Se não tiver no banco, usar 90 como padrão
        setTurnTimeLimit(90);
      }
      
      // Usar tempo restante calculado pelo backend se disponível
      if (data.turnTimeRemaining !== undefined) {
        setTurnTimeLeft(data.turnTimeRemaining);
      } else if (data.turnTime !== undefined && data.turnTime > 0) {
        setTurnTimeLeft(data.turnTime);
      } else {
        setTurnTimeLeft(90);
      }
      
      // Salvar timestamp de quando o turno começou
      if (data.turnStartedAt) {
        const startedAt = typeof data.turnStartedAt === 'string' 
          ? new Date(data.turnStartedAt) 
          : data.turnStartedAt;
        setTurnStartedAt(startedAt);
      } else {
        setTurnStartedAt(null);
      }
      
      // Carregar deck, mão, monstros e spell/trap do jogador
      if (data.player1Field) {
        const deck = data.player1Field.deck || [];
        const hand = data.player1Field.hand || [];
        const monsters = data.player1Field.monsters || [null, null, null, null, null];
        const spellTraps = data.player1Field.spellTraps || [null, null, null, null, null];
        
        if (isPlayer1) {
          setMyDeck(deck);
          setMyHand(hand);
          setMyMonsters(monsters);
          setMySpellTraps(spellTraps);
        } else {
          setOpponentDeck(deck);
          setOpponentHand(hand);
          setOpponentMonsters(monsters);
          setOpponentSpellTraps(spellTraps);
        }
      }
      
      // Carregar deck, mão, monstros e spell/trap do oponente
      if (data.player2Field) {
        const deck = data.player2Field.deck || [];
        const hand = data.player2Field.hand || [];
        const monsters = data.player2Field.monsters || [null, null, null, null, null];
        const spellTraps = data.player2Field.spellTraps || [null, null, null, null, null];
        
        if (isPlayer1) {
          setOpponentDeck(deck);
          setOpponentHand(hand);
          setOpponentMonsters(monsters);
          setOpponentSpellTraps(spellTraps);
        } else {
          setMyDeck(deck);
          setMyHand(hand);
          setMyMonsters(monsters);
          setMySpellTraps(spellTraps);
        }
      }
      
      setLoading(false);
      setError(null);
    };

    const handleDuelError = (data: any) => {
      setError(data.message || 'Erro ao carregar duelo');
      setLoading(false);
    };

    // Obter socket do hook useSocket
    // CRÍTICO: A nova aba precisa criar seu próprio socket independente
    let socket = getSocket();
    
    // Se não há socket ou não está conectado, aguardar a conexão
    // O useSocket já cria o socket automaticamente, mas pode levar alguns milissegundos
    const setupSocket = () => {
      // Obter socket novamente (pode ter sido criado enquanto aguardávamos)
      socket = getSocket();
      
      if (!socket || !socket.connected) {
        return false;
      }

      // Registrar listeners
      socket.on('duelUpdate', handleDuelUpdate);
      socket.on('duelError', handleDuelError);
      
      // Listener para quando o tempo do oponente expira (recebido do backend)
      const timeExpiredListener = (data: any) => {
        if (!isMyTurn) {
          setTimeExpired(true);
        }
      };
      socket.on('timeExpired', timeExpiredListener);
      
      // Entrar na room do duelo via WebSocket (carregamento instantâneo)
      const duelIdStr = typeof duelId === 'string' ? duelId : String(duelId);
      const numericUserId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      
      joinDuelRoom(duelIdStr, numericUserId);
      
      return true;
    };

    // Aguardar um pouco para o useSocket inicializar o socket
    // Isso é especialmente importante quando a página abre em uma nova aba
    let retryInterval: NodeJS.Timeout | null = null;
    let connectListener: (() => void) | null = null;
    
    const initTimeout = setTimeout(() => {
      // Tentar configurar imediatamente
      if (setupSocket()) {
        return;
      }
      
      // Se o socket existe mas não está conectado, aguardar evento de conexão
      const currentSocket = getSocket();
      if (currentSocket && !currentSocket.connected) {
        connectListener = () => {
          if (setupSocket() && currentSocket && connectListener) {
            currentSocket.off('connect', connectListener);
            connectListener = null;
          }
        };
        currentSocket.on('connect', connectListener);
      }
      
      // Também iniciar retry como fallback
      let attempts = 0;
      const maxAttempts = 20;
      
      retryInterval = setInterval(() => {
        attempts++;
        
        if (setupSocket()) {
          if (retryInterval) {
            clearInterval(retryInterval);
            retryInterval = null;
          }
          const currentSocket = getSocket();
          if (currentSocket && connectListener) {
            currentSocket.off('connect', connectListener);
            connectListener = null;
          }
        } else if (attempts >= maxAttempts) {
          if (retryInterval) {
            clearInterval(retryInterval);
            retryInterval = null;
          }
          const currentSocket = getSocket();
          if (currentSocket && connectListener) {
            currentSocket.off('connect', connectListener);
            connectListener = null;
          }
          setError('WebSocket não conectado. Aguarde alguns segundos e recarregue a página.');
          setLoading(false);
        }
      }, 500);
    }, 100);
    
    // Marcar como inicializado
    hasInitializedRef.current = true;
    
    // Cleanup
    return () => {
      hasInitializedRef.current = false;
      clearTimeout(initTimeout);
      if (retryInterval) {
        clearInterval(retryInterval);
      }
      const currentSocket = getSocket();
      if (currentSocket) {
        currentSocket.off('duelUpdate', handleDuelUpdate);
        currentSocket.off('duelError', handleDuelError);
        currentSocket.off('timeExpired');
        // Remover listener de conexão se ainda estiver ativo
        if (connectListener) {
          currentSocket.off('connect', connectListener);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelId, user?.id]);

  // Debug removido para evitar spam no console

  // Atualizar dados do duelFound se vier do WebSocket
  useEffect(() => {
    if (duelFound) {
      setMyLifePoints(duelFound.lifePoints);
      setOpponentLifePoints(duelFound.opponentLifePoints);
      setIsMyTurn(duelFound.yourTurn);
      
      // Atualizar deck e mão se vierem no duelFound
      const userId = typeof user?.id === 'string' ? parseInt(user?.id, 10) : Number(user?.id);
      const player1Id = typeof duelData?.player1?.id === 'string' ? parseInt(duelData?.player1?.id, 10) : Number(duelData?.player1?.id);
      const player2Id = typeof duelData?.player2?.id === 'string' ? parseInt(duelData?.player2?.id, 10) : Number(duelData?.player2?.id);
      
      if (duelFound.player1Field && userId === player1Id) {
        setMyDeck(duelFound.player1Field.deck || []);
        setMyHand(duelFound.player1Field.hand || []);
        setOpponentDeck(duelFound.player2Field?.deck || []);
        setOpponentHand(duelFound.player2Field?.hand || []);
      } else if (duelFound.player2Field && userId === player2Id) {
        setMyDeck(duelFound.player2Field.deck || []);
        setMyHand(duelFound.player2Field.hand || []);
        setOpponentDeck(duelFound.player1Field?.deck || []);
        setOpponentHand(duelFound.player1Field?.hand || []);
      }
    }
  }, [duelFound, duelData, user]);

  // Escutar mudanças de turno via WebSocket
  useEffect(() => {
    if (currentTurn !== null && user) {
      // Tentar usar duelData primeiro, depois duelUpdate
      let player1Id: number | null = null;
      if (duelData?.player1?.id) {
        player1Id = typeof duelData.player1.id === 'string' ? parseInt(duelData.player1.id, 10) : Number(duelData.player1.id);
      }
      
      if (player1Id) {
        const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
        const isPlayer1 = userId === player1Id;
        const myTurnNumber = isPlayer1 ? 1 : 2;
        setIsMyTurn(currentTurn === myTurnNumber);
      }
    }
  }, [currentTurn, duelData, user]);

  // Escutar atualizações do duelo (quando comprar carta, etc)
  // Usar useRef para evitar loops de renderização
  const lastDuelUpdateTimestampRef = useRef<number>(0);
  const lastDuelUpdateIdRef = useRef<string | null>(null);
  const processedUpdatesRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    if (!duelUpdate || !user) {
      return;
    }
    
    // Verificar se os campos estão presentes - se não estiverem, ignorar
    if (!duelUpdate.player1Field && !duelUpdate.player2Field) {
      return; // Ignorar updates sem campos
    }
    
    // Criar um ID único baseado em dados relevantes do update
    const updateId = `${duelUpdate.id || 'no-id'}-${duelUpdate.currentTurn || 0}-${duelUpdate.currentPhase || 'no-phase'}-${duelUpdate.player1LifePoints || 0}-${duelUpdate.player2LifePoints || 0}`;
    
    // Se já processamos este update exato, ignorar
    if (processedUpdatesRef.current.has(updateId)) {
      return;
    }
    
    // Usar timestamp para evitar processar atualizações muito próximas
    const now = Date.now();
    if (now - lastDuelUpdateTimestampRef.current < 50) {
      return; // Ignorar atualizações muito próximas (menos de 50ms)
    }
    
    lastDuelUpdateTimestampRef.current = now;
    processedUpdatesRef.current.add(updateId);
    
    // Limpar updates antigos (manter apenas os últimos 100)
    if (processedUpdatesRef.current.size > 100) {
      const firstKey = processedUpdatesRef.current.values().next().value;
      processedUpdatesRef.current.delete(firstKey);
    }
    
    // Atualizar life points
    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      
    // Usar duelUpdate.player1?.id ou duelData.player1.id para determinar qual campo usar
    const player1Id = duelUpdate.player1?.id 
      ? (typeof duelUpdate.player1.id === 'string' ? parseInt(duelUpdate.player1.id, 10) : Number(duelUpdate.player1.id))
      : (duelData?.player1?.id ? (typeof duelData.player1.id === 'string' ? parseInt(duelData.player1.id, 10) : Number(duelData.player1.id)) : null);
    
    if (!player1Id) {
        // Tentar processar mesmo sem player1Id - usar os campos baseado no que está disponível
        if (duelUpdate.player1Field && duelUpdate.player2Field) {
          // Se ambos os campos estão disponíveis, tentar determinar pelo userId
          // Assumir que o primeiro campo é sempre player1
          const player1IdFromField = duelUpdate.player1?.id || (duelData?.player1?.id);
          if (player1IdFromField) {
            const p1Id = typeof player1IdFromField === 'string' ? parseInt(player1IdFromField, 10) : Number(player1IdFromField);
            if (userId === p1Id) {
              // É player1
              const deck = duelUpdate.player1Field.deck || [];
              const hand = duelUpdate.player1Field.hand || [];
              setMyDeck(deck);
              setMyHand(hand);
              setMyLifePoints(duelUpdate.player1LifePoints);
              setOpponentLifePoints(duelUpdate.player2LifePoints);
              setMyMonsters(duelUpdate.player1Field.monsters || [null, null, null, null, null]);
              setMySpellTraps(duelUpdate.player1Field.spellTraps || [null, null, null, null, null]);
              setOpponentDeck(duelUpdate.player2Field.deck || []);
              setOpponentHand(duelUpdate.player2Field.hand || []);
              setOpponentMonsters(duelUpdate.player2Field.monsters || [null, null, null, null, null]);
              setOpponentSpellTraps(duelUpdate.player2Field.spellTraps || [null, null, null, null, null]);
            } else {
              // É player2
              const deck = duelUpdate.player2Field.deck || [];
              const hand = duelUpdate.player2Field.hand || [];
              setMyDeck(deck);
              setMyHand(hand);
              setMyLifePoints(duelUpdate.player2LifePoints);
              setOpponentLifePoints(duelUpdate.player1LifePoints);
              setMyMonsters(duelUpdate.player2Field.monsters || [null, null, null, null, null]);
              setMySpellTraps(duelUpdate.player2Field.spellTraps || [null, null, null, null, null]);
              setOpponentDeck(duelUpdate.player1Field.deck || []);
              setOpponentHand(duelUpdate.player1Field.hand || []);
              setOpponentMonsters(duelUpdate.player1Field.monsters || [null, null, null, null, null]);
              setOpponentSpellTraps(duelUpdate.player1Field.spellTraps || [null, null, null, null, null]);
            }
          }
      }
      return;
    }
    
    if (userId === player1Id) {
      setMyLifePoints(duelUpdate.player1LifePoints);
      setOpponentLifePoints(duelUpdate.player2LifePoints);
      
      // Atualizar deck, mão, monstros e spell/trap
      if (duelUpdate.player1Field) {
        const deck = duelUpdate.player1Field.deck || [];
        const hand = duelUpdate.player1Field.hand || [];
        setMyDeck(deck);
        setMyHand(hand);
        setMyMonsters(duelUpdate.player1Field.monsters || [null, null, null, null, null]);
        setMySpellTraps(duelUpdate.player1Field.spellTraps || [null, null, null, null, null]);
      }
      if (duelUpdate.player2Field) {
        setOpponentDeck(duelUpdate.player2Field.deck || []);
        setOpponentHand(duelUpdate.player2Field.hand || []);
        setOpponentMonsters(duelUpdate.player2Field.monsters || [null, null, null, null, null]);
        setOpponentSpellTraps(duelUpdate.player2Field.spellTraps || [null, null, null, null, null]);
      }
    } else {
      // É Player2
      setMyLifePoints(duelUpdate.player2LifePoints);
      setOpponentLifePoints(duelUpdate.player1LifePoints);
      
      // Atualizar deck, mão, monstros e spell/trap
      if (duelUpdate.player2Field) {
        const deck = duelUpdate.player2Field.deck || [];
        const hand = duelUpdate.player2Field.hand || [];
        setMyDeck(deck);
        setMyHand(hand);
        setMyMonsters(duelUpdate.player2Field.monsters || [null, null, null, null, null]);
        setMySpellTraps(duelUpdate.player2Field.spellTraps || [null, null, null, null, null]);
      }
      if (duelUpdate.player1Field) {
        setOpponentDeck(duelUpdate.player1Field.deck || []);
        setOpponentHand(duelUpdate.player1Field.hand || []);
        setOpponentMonsters(duelUpdate.player1Field.monsters || [null, null, null, null, null]);
        setOpponentSpellTraps(duelUpdate.player1Field.spellTraps || [null, null, null, null, null]);
      }
    }
    
    // Atualizar fase
    if (duelUpdate.currentPhase) {
      setCurrentPhase(duelUpdate.currentPhase);
    }
    
    // Atualizar tempo do duelo se vier na atualização
    if (duelUpdate.duelTime !== undefined) {
      setDuelTime(duelUpdate.duelTime);
      // Se temos createdAt mas não temos duelStartTime, calcular
      if (!duelStartTime && duelUpdate.createdAt) {
        const createdAt = new Date(duelUpdate.createdAt);
        setDuelStartTime(createdAt.getTime());
      }
    }
    
    // Atualizar tempo do turno se vier na atualização (sincronizar com o banco)
    if (duelUpdate.turnTime !== undefined && duelUpdate.turnTime > 0) {
      setTurnTimeLimit(duelUpdate.turnTime);
    }
    
    // Usar tempo restante calculado pelo backend se disponível
    if (duelUpdate.turnTimeRemaining !== undefined) {
      setTurnTimeLeft(duelUpdate.turnTimeRemaining);
    } else if (duelUpdate.turnTime !== undefined && duelUpdate.turnTime > 0) {
      // Se o turno mudou, resetar o timer para o novo valor
      if (duelUpdate.currentTurn && duelUpdate.currentTurn !== currentTurn) {
        setTurnTimeLeft(duelUpdate.turnTime);
      }
    }
    
    // Atualizar timestamp de quando o turno começou
    if (duelUpdate.turnStartedAt) {
      const startedAt = typeof duelUpdate.turnStartedAt === 'string' 
        ? new Date(duelUpdate.turnStartedAt) 
        : duelUpdate.turnStartedAt;
      setTurnStartedAt(startedAt);
    }
    
    // Atualizar turno
    if (duelUpdate.currentTurn && duelData?.player1) {
      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      const player1Id = typeof duelData.player1.id === 'string' ? parseInt(duelData.player1.id, 10) : Number(duelData.player1.id);
      const isPlayer1 = userId === player1Id;
      const myTurnNumber = isPlayer1 ? 1 : 2;
      setIsMyTurn(duelUpdate.currentTurn === myTurnNumber);
    } else if (duelUpdate.currentTurn && duelUpdate.player1) {
      // Usar player1 do duelUpdate se duelData não estiver disponível
      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      const player1Id = typeof duelUpdate.player1.id === 'string' ? parseInt(duelUpdate.player1.id, 10) : Number(duelUpdate.player1.id);
      const isPlayer1 = userId === player1Id;
      const myTurnNumber = isPlayer1 ? 1 : 2;
      setIsMyTurn(duelUpdate.currentTurn === myTurnNumber);
    }
  }, [duelUpdate, duelData, user, duelStartTime, currentTurn]);


  // Timer do Duelo - Atualiza o tempo total do duelo
  useEffect(() => {
    if (!duelData || loading) return;

    // Se não temos duelStartTime, calcular baseado no createdAt
    if (!duelStartTime && duelData.createdAt) {
      const createdAt = new Date(duelData.createdAt);
      setDuelStartTime(createdAt.getTime());
    }

    // Atualizar tempo a cada segundo
    const duelTimer = setInterval(() => {
      if (duelStartTime) {
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - duelStartTime) / 1000);
        setDuelTime(elapsedSeconds);
        
        // Enviar atualização para o backend a cada 5 segundos
        if (elapsedSeconds % 5 === 0 && duelId) {
          const socket = getSocket();
          if (socket && socket.connected) {
            socket.emit('updateDuelTime', { duelId, timeInSeconds: elapsedSeconds });
          }
        }
      } else if (duelData.createdAt) {
        // Se ainda não temos duelStartTime, calcular agora
        const createdAt = new Date(duelData.createdAt);
        setDuelStartTime(createdAt.getTime());
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - createdAt.getTime()) / 1000);
        setDuelTime(elapsedSeconds);
      }
    }, 1000);

    return () => {
      clearInterval(duelTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelData, duelStartTime, loading, duelId]);

  // Atualizar refs quando os valores mudam
  useEffect(() => {
    isMyTurnRef.current = isMyTurn;
    duelIdRef.current = duelId;
    userIdRef.current = user?.id;
    turnStartedAtRef.current = turnStartedAt;
    turnTimeLimitRef.current = turnTimeLimit || 90;
  }, [isMyTurn, duelId, user?.id, turnStartedAt, turnTimeLimit]);

  // Timer do Turno - Calcula baseado no timestamp do backend
  useEffect(() => {
    // Limpar timer anterior se existir
    if (turnTimer) {
      clearInterval(turnTimer);
      setTurnTimer(null);
    }

    // Resetar estado de tempo expirado quando o turno muda
    setTimeExpired(false);

    // Função para calcular tempo restante baseado no timestamp
    const calculateRemainingTime = (): number => {
      const currentTurnStartedAt = turnStartedAtRef.current;
      const currentTurnTimeLimit = turnTimeLimitRef.current;
      
      // Se não há timestamp, retornar o limite
      if (!currentTurnStartedAt) {
        return currentTurnTimeLimit;
      }
      
      const now = new Date();
      const startedAt = currentTurnStartedAt instanceof Date ? currentTurnStartedAt : new Date(currentTurnStartedAt);
      const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
      const remaining = Math.max(0, currentTurnTimeLimit - elapsedSeconds);
      
      return remaining;
    };

    // Atualizar tempo inicial baseado no cálculo
    const initialTime = calculateRemainingTime();
    setTurnTimeLeft(initialTime);

    // Criar timer que recalcula baseado no timestamp
    // O timer deve rodar sempre, independente de ser o turno do jogador ou não
    const timer = setInterval(() => {
      const remaining = calculateRemainingTime();
      setTurnTimeLeft(remaining);
      
      if (remaining <= 0) {
        // Tempo acabou!
        setTimeExpired(true);
        // Notificar o oponente que o tempo expirou (apenas se for meu turno)
        if (isMyTurnRef.current) {
          const socket = getSocket();
          if (socket && socket.connected) {
            socket.emit('timeExpired', { 
              duelId: duelIdRef.current, 
              userId: userIdRef.current 
            });
          }
        }
      }
    }, 1000);
    
    setTurnTimer(timer);

    // Cleanup ao desmontar ou mudar turno
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnTimeLimit, turnStartedAt]);

  // Função para finalizar turno
  const handleEndTurn = () => {
    if (!duelId || !user?.id) {
      console.error('❌ DuelId ou UserId não encontrados');
      return;
    }

    endTurn(duelId, user.id);
    
    if (turnTimer) {
      clearInterval(turnTimer);
      setTurnTimer(null);
    }
    setTimeExpired(false);
  };

  // Função para roubar turno quando o oponente está com tempo expirado
  const handleStealTurn = () => {
    if (!duelId || !user?.id) {
      console.error('❌ DuelId ou UserId não encontrados');
      return;
    }

    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('stealTurn', { duelId, userId: user.id });
      setTimeExpired(false);
    }
  };

  // Função helper para comparar cartas
  const isSameCard = (card1: any, card2: any): boolean => {
    if (!card1 || !card2) return false;
    
    // Comparar por id
    if (card1.id && card2.id && card1.id === card2.id) return true;
    if (card1.cardId && card2.cardId && card1.cardId === card2.cardId) return true;
    
    // Comparar id com cardId
    if (card1.id && card2.cardId && card1.id === card2.cardId) return true;
    if (card1.cardId && card2.id && card1.cardId === card2.id) return true;
    
    return false;
  };

  // Função para colocar carta no campo
  const handlePlaceCardOnField = async (card: any, position: 'attack' | 'defense' | 'set', zoneIndex: number, cardType?: string) => {
    if (!duelId || !user?.id || !isMyTurn) {
      alert('Não é seu turno!');
      return;
    }

    // Determinar o tipo da carta
    const type = cardType || card.type || card.cardType;
    const isMonster = type === 'Monster';
    const isSpellOrTrap = type === 'Spell' || type === 'Trap';

    if (!isMonster && !isSpellOrTrap) {
      alert('Tipo de carta inválido!');
      return;
    }

    if (zoneIndex < 0 || zoneIndex >= 5) {
      alert('Zona inválida!');
      return;
    }

    // Verificar se a carta ainda está na mão
    const cardInHand = myHand.find(c => (c.id === card.id || c.cardId === card.cardId));
    if (!cardInHand) {
      alert('Carta não encontrada na mão!');
      return;
    }

    if (isMonster) {
      // Verificar se a zona de monstro está ocupada
      if (myMonsters[zoneIndex] !== null) {
        alert('Esta zona de monstro já está ocupada!');
        return;
      }

      // Remover carta da mão
      const updatedHand = myHand.filter(c => c.id !== card.id && c.cardId !== card.cardId);
      setMyHand(updatedHand);

      // Adicionar carta à Monster Zone
      const cardOnField = {
        ...card,
        position, // 'attack' ou 'defense'
        zoneIndex,
      };
      const updatedMonsters = [...myMonsters];
      updatedMonsters[zoneIndex] = cardOnField;
      setMyMonsters(updatedMonsters);

      // Enviar ação para o backend
      performAction(duelId, user.id, position === 'attack' ? 'SUMMON_MONSTER' : 'SET_MONSTER', {
        cardId: card.id || card.cardId,
        cardName: card.name,
        zoneIndex,
        position,
      });
    } else if (isSpellOrTrap) {
      // Verificar se a zona de spell/trap está ocupada
      if (mySpellTraps[zoneIndex] !== null) {
        alert('Esta zona de spell/trap já está ocupada!');
        return;
      }

      // Remover carta da mão
      const updatedHand = myHand.filter(c => c.id !== card.id || c.cardId !== card.cardId);
      setMyHand(updatedHand);

      // Adicionar carta à Spell/Trap Zone
      const cardOnField = {
        ...card,
        position: position === 'set' ? 'set' : 'face-up', // Spell/Trap pode ser set ou face-up
        zoneIndex,
      };
      const updatedSpellTraps = [...mySpellTraps];
      updatedSpellTraps[zoneIndex] = cardOnField;
      setMySpellTraps(updatedSpellTraps);

      // Enviar ação para o backend
      performAction(duelId, user.id, position === 'set' ? 'SET_SPELL_TRAP' : 'ACTIVATE_SPELL_TRAP', {
        cardId: card.id || card.cardId,
        cardName: card.name,
        zoneIndex,
        position: position === 'set' ? 'set' : 'face-up',
      });
    }

    // Limpar seleção
    setSelectedCardForField(null);
  };

  if (!user) {
    return <Navigate to="/" />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-white text-2xl">Carregando duelo...</div>
      </div>
    );
  }

  if (error || !duelData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="max-w-md w-full bg-slate-800/50 rounded-xl border border-red-500/30 p-8 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-3xl font-bold text-red-400 mb-4">Erro ao Carregar Duelo</h2>
          <p className="text-slate-300 mb-6">
            {error || 'Não foi possível carregar os dados do duelo.'}
          </p>
          <p className="text-slate-400 text-sm mb-6">
            Duelo ID: <span className="font-mono text-purple-400">{duelId}</span>
          </p>
          <button
            onClick={() => window.location.href = '/random-duel'}
            className="gradient blue-purple px-8 py-3 rounded-lg font-bold"
          >
            Voltar para Random Duel
          </button>
        </div>
      </div>
    );
  }

  // Determinar quem é o oponente
  if (!duelData || !duelData.player1 || !user) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl mb-4">Carregando duelo...</p>
          {loading && <p className="text-gray-400">Aguarde...</p>}
        </div>
      </div>
    );
  }
  
  const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
  const player1Id = typeof duelData.player1.id === 'string' ? parseInt(duelData.player1.id, 10) : Number(duelData.player1.id);
  const isPlayer1 = userId === player1Id;
  const opponent = isPlayer1 ? duelData.player2 : duelData.player1;
  const myClanTag = user?.clanTag || '';
  const opponentClanTag = (opponent as any).clanTag || '';

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden">
      {/* Background Image com animação suave */}
      <motion.div 
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage: 'url(/images/background.webp)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
        }}
        animate={{
          scale: [1, 1.02, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      {/* Dark Overlay com gradiente moderno */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-black/60 via-purple-900/20 to-black/60" />
      {/* Efeito de partículas/brilho sutil */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(147,51,234,0.1),transparent_50%)]" />
      
      <div className="w-full h-full flex flex-col">
        {/* Header: Informações dos Duelistas - Modernizado */}
        <motion.div 
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex items-center justify-center gap-12 mb-2 px-6 py-3 bg-gradient-to-r from-slate-900/90 via-purple-900/80 to-slate-900/90 backdrop-blur-xl border-b-2 border-purple-500/60 shadow-2xl shadow-purple-500/30"
        >
          {/* MEU DUELISTA (Esquerda) - Modernizado */}
          <motion.div 
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-3 bg-gradient-to-r from-blue-900/40 to-blue-800/30 backdrop-blur-md px-5 py-3 rounded-xl border-2 border-blue-400/50 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all"
          >
            {/* Level - Modernizado */}
            <motion.div 
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="flex flex-col items-center bg-gradient-to-br from-yellow-600/30 to-yellow-500/20 backdrop-blur-sm px-3 py-2 rounded-lg border-2 border-yellow-400/50 shadow-md"
            >
              <div className="text-yellow-300 text-[10px] font-bold tracking-wider">LV</div>
              <div className="text-yellow-200 text-xl font-bold drop-shadow-lg">{user.level || 1}</div>
            </motion.div>
            
            {/* Avatar Quadrado - Modernizado */}
            <motion.img 
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ duration: 0.2 }}
              src={
                user.profileImage 
                  ? `http://localhost:3000${user.profileImage}` 
                  : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.username) + '&background=3b82f6&color=fff&size=128'
              } 
              alt={user.username}
              className="w-16 h-16 rounded-xl border-2 border-blue-400/70 object-cover shadow-lg shadow-blue-500/30 ring-2 ring-blue-500/20"
              onError={(e) => {
                e.currentTarget.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.username) + '&background=3b82f6&color=fff&size=128';
              }}
            />
            
            {/* Info: Clan + Nick + LP - Modernizado */}
            <div>
              <div className="text-sm font-bold text-blue-300 drop-shadow-md">
                {myClanTag ? `|${myClanTag}| ${user.nickname || user.username}` : (user.nickname || user.username)}
              </div>
              <motion.div 
                key={myLifePoints}
                initial={{ scale: 1.2, color: "#ef4444" }}
                animate={{ scale: 1, color: "#93c5fd" }}
                transition={{ duration: 0.3 }}
                className="text-blue-200 font-bold text-lg tracking-wide"
              >
                LP: {myLifePoints.toLocaleString()}
              </motion.div>
              <div className="text-xs text-blue-300/80 mt-1 font-medium">
                S: {user.winsSeason || 0}/{user.lossesSeason || 0} | G: {user.winsGeral || 0}/{user.lossesGeral || 0}
              </div>
            </div>
          </motion.div>

          {/* TIMER (Centro) - Modernizado */}
          <div className="flex items-center">
            <motion.div 
              className={`px-6 py-3 rounded-2xl border-2 shadow-2xl backdrop-blur-xl transition-all ${
                isMyTurn 
                  ? turnTimeLeft <= 10 
                    ? 'bg-gradient-to-br from-red-900/60 to-red-800/50 border-red-400 shadow-red-500/50' 
                    : 'bg-gradient-to-br from-blue-900/60 to-indigo-800/50 border-blue-400 shadow-blue-500/50'
                  : 'bg-gradient-to-br from-slate-800/60 to-slate-700/50 border-slate-500 shadow-slate-600/30'
              }`}
              animate={isMyTurn && turnTimeLeft <= 10 ? { 
                scale: [1, 1.08, 1],
                boxShadow: [
                  "0 0 20px rgba(239, 68, 68, 0.5)",
                  "0 0 40px rgba(239, 68, 68, 0.8)",
                  "0 0 20px rgba(239, 68, 68, 0.5)"
                ]
              } : {}}
              transition={{ duration: 0.6, repeat: Infinity }}
            >
              <div className={`text-[11px] mb-1 text-center font-bold tracking-widest uppercase ${
                isMyTurn ? 'text-blue-200' : 'text-slate-400'
              }`}>
                {isMyTurn ? 'Seu Turno' : 'Turno Oponente'}
              </div>
              <motion.div 
                key={turnTimeLeft}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                className={`text-3xl font-bold font-mono text-center drop-shadow-lg ${
                  isMyTurn 
                    ? turnTimeLeft <= 10 
                      ? 'text-red-300' 
                      : 'text-blue-200'
                    : 'text-slate-300'
                }`}
              >
                {turnTimeLeft}s
              </motion.div>
            </motion.div>
          </div>

          {/* OPONENTE (Direita) - Modernizado */}
          <motion.div 
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-3 bg-gradient-to-r from-red-900/40 to-red-800/30 backdrop-blur-md px-5 py-3 rounded-xl border-2 border-red-400/50 shadow-lg shadow-red-500/20 hover:shadow-red-500/40 transition-all"
          >
            {/* Info: Clan + Nick + LP - Modernizado */}
            <div className="text-right">
              <div className="text-sm font-bold text-red-300 drop-shadow-md">
                {opponentClanTag ? `|${opponentClanTag}| ` : ''}
                {opponent.nickname || opponent.username}
              </div>
              <motion.div 
                key={opponentLifePoints}
                initial={{ scale: 1.2, color: "#ef4444" }}
                animate={{ scale: 1, color: "#fca5a5" }}
                transition={{ duration: 0.3 }}
                className="text-red-200 font-bold text-lg tracking-wide"
              >
                LP: {opponentLifePoints.toLocaleString()}
              </motion.div>
              {(opponent.winsSeason !== undefined || opponent.winsGeral !== undefined) && (
                <div className="text-xs text-red-300/80 mt-1 font-medium">
                  S: {opponent.winsSeason || 0}/{opponent.lossesSeason || 0} | G: {opponent.winsGeral || 0}/{opponent.lossesGeral || 0}
                </div>
              )}
            </div>
            
            {/* Avatar Quadrado - Modernizado */}
            <motion.img 
              whileHover={{ scale: 1.1, rotate: -5 }}
              transition={{ duration: 0.2 }}
              src={
                opponent.profileImage 
                  ? `http://localhost:3000${opponent.profileImage}` 
                  : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(opponent.username) + '&background=ef4444&color=fff&size=128'
              } 
              alt={opponent.username}
              className="w-16 h-16 rounded-xl border-2 border-red-400/70 object-cover shadow-lg shadow-red-500/30 ring-2 ring-red-500/20"
              onError={(e) => {
                e.currentTarget.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(opponent.username) + '&background=ef4444&color=fff&size=128';
              }}
            />
            
            {/* Level - Modernizado */}
            <motion.div 
              whileHover={{ scale: 1.1, rotate: -5 }}
              className="flex flex-col items-center bg-gradient-to-br from-yellow-600/30 to-yellow-500/20 backdrop-blur-sm px-3 py-2 rounded-lg border-2 border-yellow-400/50 shadow-md"
            >
              <div className="text-yellow-300 text-[10px] font-bold tracking-wider">LV</div>
              <div className="text-yellow-200 text-xl font-bold drop-shadow-lg">{(opponent as any).level || 1}</div>
            </motion.div>
          </motion.div>
        </motion.div>

        <div className="flex gap-0 flex-1 overflow-hidden">
          {/* Painel Esquerdo: Chat e Logs - Modernizado */}
          <motion.div 
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-[280px] flex-shrink-0 space-y-2 bg-gradient-to-b from-slate-900/90 to-slate-800/90 backdrop-blur-xl border-r-2 border-purple-500/40 shadow-2xl h-full overflow-y-auto"
          >
            <DuelChat
              messages={chatMessages}
              onSendMessage={(message) => {
                if (duelId && user?.id) {
                  const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
                  if (!isNaN(userId)) {
                    sendChatMessage(duelId, userId, message);
                  } else {
                    console.error('❌ ID de usuário inválido:', user.id);
                  }
                }
              }}
            />
            <DuelLogs logs={duelLogs} />
          </motion.div>

          {/* Arena Principal - Modernizado */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex-1 space-y-3 pl-3 overflow-y-auto"
          >
            {/* Mão do Oponente (cartas viradas) - Modernizado */}
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex justify-center gap-1 py-3 bg-gradient-to-r from-slate-900/60 to-slate-800/60 backdrop-blur-md rounded-xl border-2 border-purple-500/40 shadow-lg min-h-[70px]"
            >
              {opponentHand.length === 0 ? (
                <div className="text-slate-400 text-xs py-2 font-medium">Mão vazia</div>
              ) : (
                opponentHand.map((card: any, index: number) => (
                  <motion.div 
                    key={`opp-hand-${index}`}
                    initial={{ opacity: 0, rotate: -180 }}
                    animate={{ opacity: 1, rotate: -180 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ scale: 1.1, y: -5 }}
                    className="w-11 h-16 rounded-lg border-2 border-purple-400/60 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all"
                    style={{
                      backgroundImage: `url(/images/fundoCarta.webp)`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                    }}
                  />
                ))
              )}
            </motion.div>

            {/* Campo do Oponente */}
            <DuelField 
              isOpponent={true} 
              deckCount={opponentDeck.length} 
              handCount={opponentHand.length}
              monsters={opponentMonsters}
              spellTraps={opponentSpellTraps}
            />

            {/* Meu Campo */}
            <DuelField 
              isOpponent={false} 
              deckCount={myDeck.length} 
              handCount={myHand.length}
              monsters={myMonsters}
              spellTraps={mySpellTraps}
            />

            {/* Fases do Jogo - Modernizado */}
            {isMyTurn && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-center items-center gap-2 py-3 px-5 bg-gradient-to-r from-purple-900/90 via-indigo-900/80 to-purple-900/90 rounded-xl border-2 border-purple-400/60 shadow-xl backdrop-blur-md"
              >
                {['DRAW', 'STANDBY', 'MAIN1', 'BATTLE', 'MAIN2', 'END'].map((phase, index) => {
                  const phaseAbbreviations: { [key: string]: string } = {
                    DRAW: 'DP',
                    STANDBY: 'SBP',
                    MAIN1: 'MP1',
                    BATTLE: 'BP',
                    MAIN2: 'MP2',
                    END: 'EP'
                  };
                  
                  const phaseFullNames: { [key: string]: string } = {
                    DRAW: 'Draw Phase (Fase de Compras)',
                    STANDBY: 'Standby Phase (Fase de Apoio)',
                    MAIN1: 'Main Phase 1 (Fase Principal 1)',
                    BATTLE: 'Battle Phase (Fase de Batalha)',
                    MAIN2: 'Main Phase 2 (Fase Principal 2)',
                    END: 'End Phase (Fase Final)'
                  };
                  
                  const phaseIndex = ['DRAW', 'STANDBY', 'MAIN1', 'BATTLE', 'MAIN2', 'END'].indexOf(currentPhase);
                  const isActive = currentPhase === phase;
                  const isPast = phaseIndex > index;
                  const isNext = phaseIndex === index - 1;
                  
                  return (
                    <React.Fragment key={phase}>
                      <motion.button
                        whileHover={isActive ? { scale: 1.1, y: -2 } : {}}
                        whileTap={isActive ? { scale: 0.95 } : {}}
                        onClick={() => {
                          if (isActive && isMyTurn && duelId && user?.id) {
                            const socket = getSocket();
                            if (socket && socket.connected) {
                              socket.emit('nextPhase', { duelId, userId: user.id });
                            }
                          }
                        }}
                        disabled={!isActive || !isMyTurn}
                        className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all border-2 min-w-[60px] backdrop-blur-sm ${
                          isActive
                            ? 'bg-gradient-to-br from-yellow-500 to-orange-500 text-white border-yellow-300 shadow-xl shadow-yellow-500/60 hover:from-yellow-400 hover:to-orange-400 cursor-pointer ring-2 ring-yellow-400/50'
                            : isPast
                            ? 'bg-slate-700/40 text-slate-400 border-slate-600/50 cursor-not-allowed opacity-60'
                            : 'bg-slate-800/40 text-slate-500 border-slate-700/50 cursor-not-allowed opacity-40'
                        }`}
                        title={phaseFullNames[phase]}
                      >
                        {phaseAbbreviations[phase]}
                      </motion.button>
                      {index < 5 && (
                        <div className="flex items-center">
                          <div className={`w-1.5 h-1.5 rounded-full transition-all ${
                            isPast ? 'bg-green-500' : isActive ? 'bg-yellow-500 animate-pulse' : 'bg-slate-600'
                          }`} />
                          {isNext && (
                            <div className="w-8 h-0.5 bg-gradient-to-r from-yellow-500/50 to-transparent" />
                          )}
                          {!isNext && !isActive && !isPast && (
                            <div className="w-8 h-0.5 bg-slate-700/30" />
                          )}
                          {isPast && (
                            <div className="w-8 h-0.5 bg-green-500/30" />
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </motion.div>
            )}

            {/* Minha Mão (cartas visíveis) - Modernizado */}
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex justify-center gap-3 py-5 bg-gradient-to-r from-slate-900/70 via-slate-800/70 to-slate-900/70 backdrop-blur-md rounded-2xl border-2 border-yellow-500/50 shadow-2xl overflow-x-auto overflow-y-visible px-3 min-h-[280px] relative"
              style={{ overflowY: 'visible', paddingTop: '50px', paddingBottom: '20px' }}
              onClick={(e) => {
                // Fechar zoom se clicar fora das cartas
                if (e.target === e.currentTarget) {
                  setZoomedCard(null);
                  setSelectedCardForField(null);
                }
              }}
            >
              {myHand.length === 0 ? (
                <div className="text-slate-300 text-center py-8 w-full">
                  <p className="text-lg font-bold">Nenhuma carta na mão</p>
                  <p className="text-sm text-slate-400 mt-2">Deck: {myDeck.length} cartas restantes</p>
                </div>
              ) : (
                myHand.map((card: any, index: number) => {
                  return (
                  <motion.div
                    key={`my-hand-${card.idCarta || card.id || card.cardId || index}`}
                    initial={{ y: 100, opacity: 0, rotate: -5 }}
                    animate={{
                      y: 0,
                      opacity: 1,
                      rotate: 0,
                      ...(zoomedCard && isSameCard(zoomedCard, card) ? { scale: 1.5, zIndex: 100 } : {})
                    }}
                    transition={{ delay: index * 0.05, type: "spring", stiffness: 200 }}
                    whileHover={{ 
                      y: -10, 
                      scale: 1.05,
                      transition: { duration: 0.2 }
                    }}
                    className={`w-[140px] h-[196px] cursor-pointer transition-all overflow-visible flex-shrink-0 relative ${
                      zoomedCard && isSameCard(zoomedCard, card)
                        ? 'ring-4 ring-yellow-400/70 shadow-2xl'
                        : 'hover:ring-2 hover:ring-yellow-400/30'
                    }`}
                    title={card.name || `Carta ${index + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Ao clicar, fazer zoom na carta
                      const same = isSameCard(zoomedCard, card);
                      setZoomedCard(same ? null : card);
                      setSelectedCardForField(null); // Limpar seleção ao fazer zoom
                    }}
                  >
                    <CardImage
                      card={card}
                      className="w-full h-full"
                      fallback="/images/fundoCarta.webp"
                    />
                    
                    {/* Botões de ação - Aparecem durante o turno (exceto quando está com zoom) */}
                    {(() => {
                      const isZoomed = zoomedCard && isSameCard(zoomedCard, card);
                      const shouldShow = isMyTurn && !isZoomed;
                      const cardType = card.type || card.cardType;
                      const isMonster = cardType === 'Monster';
                      const isSpellOrTrap = cardType === 'Spell' || cardType === 'Trap';
                      
                      return shouldShow && (isMonster || isSpellOrTrap);
                    })() && (
                      <div 
                        className="absolute left-1/2 transform -translate-x-1/2 flex gap-1 pointer-events-auto"
                        style={{ 
                          top: '-32px',
                          zIndex: 9999,
                          position: 'absolute'
                        }}
                      >
                        {(() => {
                          const cardType = card.type || card.cardType;
                          const isMonster = cardType === 'Monster';
                          const isSpellOrTrap = cardType === 'Spell' || cardType === 'Trap';
                          
                          if (isMonster) {
                            // Ícones para Monster: Espada (ATK) e Escudo (DEF) lado a lado, alinhados à esquerda em cima
                            return (
                              <div 
                                className="absolute top-1 left-1 flex gap-1 pointer-events-auto z-50"
                                style={{ 
                                  zIndex: 10000
                                }}
                              >
                                <motion.button
                                  whileHover={{ scale: 1.15, y: -2 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const emptyZoneIndex = myMonsters.findIndex(m => m === null);
                                    if (emptyZoneIndex !== -1) {
                                      handlePlaceCardOnField(card, 'attack', emptyZoneIndex, cardType);
                                      setZoomedCard(null);
                                    } else {
                                      alert('Todas as zonas de monstro estão ocupadas!');
                                    }
                                  }}
                                  className="w-8 h-8 bg-gradient-to-br from-red-600/90 to-red-700/90 hover:from-red-500 hover:to-red-600 border-2 border-red-400/70 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-red-500/40 backdrop-blur-md hover:shadow-red-500/60"
                                  title={`Ataque: ${card.atk || 0}`}
                                >
                                  <span className="text-sm">⚔️</span>
                                </motion.button>
                                
                                <motion.button
                                  whileHover={{ scale: 1.15, y: -2 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const emptyZoneIndex = myMonsters.findIndex(m => m === null);
                                    if (emptyZoneIndex !== -1) {
                                      handlePlaceCardOnField(card, 'defense', emptyZoneIndex, cardType);
                                      setZoomedCard(null);
                                    } else {
                                      alert('Todas as zonas de monstro estão ocupadas!');
                                    }
                                  }}
                                  className="w-8 h-8 bg-gradient-to-br from-blue-600/90 to-blue-700/90 hover:from-blue-500 hover:to-blue-600 border-2 border-blue-400/70 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-blue-500/40 backdrop-blur-md hover:shadow-blue-500/60"
                                  title={`Defesa: ${card.def || 0}`}
                                >
                                  <span className="text-sm">🛡️</span>
                                </motion.button>
                              </div>
                            );
                          } else if (isSpellOrTrap) {
                            // Botões para Spell/Trap: Ativar e Setar - Alinhados à esquerda em cima
                            return (
                              <div 
                                className="absolute top-1 left-1 flex gap-1 pointer-events-auto z-50"
                                style={{ 
                                  zIndex: 10000
                                }}
                              >
                                <motion.button
                                  whileHover={{ scale: 1.15, y: -2 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const emptyZoneIndex = mySpellTraps.findIndex(s => s === null);
                                    if (emptyZoneIndex !== -1) {
                                      handlePlaceCardOnField(card, 'face-up', emptyZoneIndex, cardType);
                                      setZoomedCard(null);
                                    } else {
                                      alert('Todas as zonas de spell/trap estão ocupadas!');
                                    }
                                  }}
                                  className="w-8 h-8 bg-gradient-to-br from-green-600/90 to-green-700/90 hover:from-green-500 hover:to-green-600 border-2 border-green-400/70 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-green-500/40 backdrop-blur-md hover:shadow-green-500/60"
                                  title="Ativar em Campo"
                                >
                                  <span className="text-sm">✨</span>
                                </motion.button>
                                
                                <motion.button
                                  whileHover={{ scale: 1.15, y: -2 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const emptyZoneIndex = mySpellTraps.findIndex(s => s === null);
                                    if (emptyZoneIndex !== -1) {
                                      handlePlaceCardOnField(card, 'set', emptyZoneIndex, cardType);
                                      setZoomedCard(null);
                                    } else {
                                      alert('Todas as zonas de spell/trap estão ocupadas!');
                                    }
                                  }}
                                  className="w-8 h-8 bg-gradient-to-br from-purple-600/90 to-purple-700/90 hover:from-purple-500 hover:to-purple-600 border-2 border-purple-400/70 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-purple-500/40 backdrop-blur-md hover:shadow-purple-500/60"
                                  title="Setar em Campo"
                                >
                                  <span className="text-sm">📜</span>
                                </motion.button>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </motion.div>
                  );
                })
              )}
            </motion.div>

            {/* Botão Roubar Turno - Modernizado */}
            {!isMyTurn && timeExpired && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="flex justify-center mt-4"
              >
                <motion.button
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleStealTurn}
                  className="bg-gradient-to-r from-red-600 to-orange-600 px-10 py-4 rounded-xl font-bold text-lg hover:from-red-500 hover:to-orange-500 transition-all border-2 border-red-300/70 shadow-2xl shadow-red-500/60 backdrop-blur-sm"
                >
                  ⚡ ROUBAR TURNO ⚡
                </motion.button>
              </motion.div>
            )}

          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default DuelArena;
