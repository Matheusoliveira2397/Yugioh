import { useCallback, useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

/** URL do WebSocket: usa env ou em produção same-origin (ws/wss conforme a página) */
function getSocketUrl(): string {
  const envWs = import.meta.env.VITE_WS_URL;
  const envApi = import.meta.env.VITE_API_URL;
  if (envWs && String(envWs).trim() !== '') return String(envWs).trim();
  if (envApi && String(envApi).trim() !== '') {
    const api = String(envApi).trim();
    if (api.startsWith('http://')) return api.replace(/^http/, 'ws');
    if (api.startsWith('https://')) return api.replace(/^https/, 'wss');
    return api;
  }
  if (import.meta.env.PROD && typeof window !== 'undefined') {
    const origin = window.location.origin;
    return origin.startsWith('https') ? origin.replace(/^https/, 'wss') : origin.replace(/^http/, 'ws');
  }
  return 'http://localhost:3000';
}

interface DuelFoundData {
  duelId: string | null;
  matchId?: string;
  player1Id?: number;
  player2Id?: number;
  opponent: {
    id: string | number;
    username?: string;
    clanTag?: string;
    level?: number;
    profileImage?: string;
  };
  yourTurn: boolean;
  lifePoints: number;
  opponentLifePoints: number;
  player1Field?: any;
  player2Field?: any;
}

interface ChatMessage {
  username: string;
  message: string;
  timestamp: Date;
  /** Foto de perfil do remetente (path ou URL); opcional em mensagens antigas */
  profileImage?: string | null;
}

interface DuelLog {
  id: string;
  username: string;
  actionType: string;
  message: string;
  createdAt: Date;
}

// ============================================
// SISTEMA DE ISOLAMENTO TOTAL POR ABA
// ============================================
// Cada aba tem seu próprio socket completamente isolado
// NENHUMA aba pode interferir com sockets de outras abas
// ============================================

/**
 * Gera um UUID v4 único para esta aba do navegador
 * Usa sessionStorage para persistir entre remontagens do componente
 * Cada aba tem seu próprio sessionStorage, garantindo isolamento total
 * Este UUID será usado como clientInstanceId no backend
 */
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Obtém ou gera um clientInstanceId único para esta aba
 * Este ID identifica unicamente esta instância/aba do cliente
 */
const getClientInstanceId = (): string => {
  const STORAGE_KEY = 'socket_client_instance_id';
  let clientInstanceId = sessionStorage.getItem(STORAGE_KEY);
  
  if (!clientInstanceId) {
    // Gerar UUID v4 único
    clientInstanceId = generateUUID();
    sessionStorage.setItem(STORAGE_KEY, clientInstanceId);
    
    console.log(`🆔 [${clientInstanceId}] Nova instância de cliente identificada`);
  }
  
  return clientInstanceId;
};

/**
 * Gera um ID único para esta aba do navegador (para logging interno)
 * Usa sessionStorage para persistir entre remontagens do componente
 * Cada aba tem seu próprio sessionStorage, garantindo isolamento total
 */
const getTabId = (): string => {
  const STORAGE_KEY = 'socket_tab_id';
  let tabId = sessionStorage.getItem(STORAGE_KEY);
  
  if (!tabId) {
    // Gerar UUID único usando timestamp + random + performance.now()
    // Isso garante que mesmo se duas abas abrirem no mesmo milissegundo,
    // elas terão IDs diferentes
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const performance = typeof window !== 'undefined' && window.performance 
      ? window.performance.now().toString(36).substring(2, 11)
      : Math.random().toString(36).substring(2, 11);
    
    tabId = `tab_${timestamp}_${random}_${performance}`;
    sessionStorage.setItem(STORAGE_KEY, tabId);
    
    console.log(`🆔 [${tabId}] Nova aba identificada`);
  }
  
  return tabId;
};

/**
 * Mapa global para armazenar sockets por tabId
 * CRÍTICO: Este mapa é compartilhado entre todas as abas, mas cada aba
 * só acessa sua própria entrada usando seu tabId único
 * 
 * NUNCA remova entradas de outras abas deste mapa!
 */
const socketRegistry: Map<string, Socket> = new Map();

/**
 * Obtém o socket para a aba atual
 * 
 * REGRAS CRÍTICAS:
 * 1. Apenas acessa o socket da própria aba (usando getTabId())
 * 2. NUNCA remove sockets de outras abas
 * 3. Se o socket da própria aba estiver desconectado, apenas tenta reconectar
 * 4. Se não conseguir reconectar, cria um novo socket APENAS para esta aba
 * 5. CRÍTICO: Garante apenas UM socket por aba
 * 
 * @returns Socket para a aba atual
 */
const getSocketForCurrentTab = (): Socket => {
  const tabId = getTabId();
  let existingSocket = socketRegistry.get(tabId);
  
  // Se já existe um socket para esta aba e está conectado, reutilizar
  if (existingSocket && existingSocket.connected) {
    console.log(`♻️ [${tabId}] Reutilizando socket existente conectado (ID: ${existingSocket.id})`);
    return existingSocket;
  }
  
  // Se existe mas está desconectado, tentar reconectar
  // CRÍTICO: NÃO criar novo socket se já existe um (mesmo que desconectado)
  // Deixar o socket.io gerenciar a reconexão automaticamente
  if (existingSocket && !existingSocket.connected) {
    console.log(`🔄 [${tabId}] Socket existe mas está desconectado. Tentando reconectar...`);
    
    // Tentar reconectar o socket existente
    try {
      // Verificar se o socket ainda está no registro antes de reconectar
      const currentRegisteredSocket = socketRegistry.get(tabId);
      if (currentRegisteredSocket === existingSocket) {
        // Socket ainda está registrado para esta aba - tentar reconectar
        existingSocket.connect();
        console.log(`🔄 [${tabId}] Tentativa de reconexão iniciada para socket ${existingSocket.id}`);
        
        // Retornar o socket existente - deixar o socket.io gerenciar a reconexão
        // NÃO criar novo socket aqui!
        return existingSocket;
      } else {
        // Socket foi substituído - criar novo abaixo
        console.log(`⚠️ [${tabId}] Socket foi substituído. Criando novo...`);
        existingSocket = null;
      }
    } catch (error) {
      console.error(`❌ [${tabId}] Erro ao tentar reconectar:`, error);
      // Em caso de erro, remover e criar novo
      socketRegistry.delete(tabId);
      existingSocket = null;
    }
  }
  
  // CRÍTICO: Verificar novamente se não há socket registrado antes de criar novo
  // Isso evita criar múltiplos sockets para a mesma aba
  if (socketRegistry.has(tabId)) {
    const registeredSocket = socketRegistry.get(tabId);
    if (registeredSocket && registeredSocket.connected) {
      console.log(`♻️ [${tabId}] Socket foi registrado enquanto processávamos. Reutilizando (ID: ${registeredSocket.id})`);
      return registeredSocket;
    }
  }
  
  // Criar novo socket APENAS se não existe nenhum para esta aba
  console.log(`🆕 [${tabId}] Criando novo socket para esta aba...`);
  
  const token = useAuthStore.getState().token;
  if (!token) {
    throw new Error('Token de autenticação não encontrado');
  }
  
  // Obter clientInstanceId único para esta aba
  const clientInstanceId = getClientInstanceId();
  console.log(`🆔 [${tabId}] Usando clientInstanceId: ${clientInstanceId}`);
  
  const socket = io(getSocketUrl(), {
    auth: { 
      token,
      clientInstanceId, // Enviar clientInstanceId no auth para o backend
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    autoConnect: true,
    // IMPORTANTE: forceNew garante que cada aba cria sua própria conexão
    // Mesmo que o socket.io tente reutilizar conexões, isso força uma nova
    forceNew: true,
  });
  
  const instanceId = `${tabId}_socket`;
  
  // Listeners de conexão
  socket.on('connect', () => {
    console.log(`✅ [${instanceId}] Socket conectado: ${socket.id} (Aba: ${tabId})`);
  });
  
  socket.on('disconnect', (reason) => {
    console.log(`❌ [${instanceId}] Socket desconectado: ${reason} (Aba: ${tabId})`);
    
    // CRÍTICO: Deixar o socket.io gerenciar a reconexão automaticamente
    // NÃO tentar reconectar manualmente aqui - isso pode causar múltiplas conexões
    // O socket.io já está configurado com reconnection: true
    
    // Apenas logar o tipo de desconexão
    if (reason === 'io client disconnect') {
      console.log(`ℹ️ [${instanceId}] Desconexão intencional do cliente. Não reconectando.`);
    } else {
      console.log(`ℹ️ [${instanceId}] Desconexão: ${reason}. Socket.io irá reconectar automaticamente.`);
    }
  });
  
  socket.on('connect_error', (error) => {
    console.error(`❌ [${instanceId}] Erro de conexão:`, error.message);
  });
  
  socket.on('reconnect', (attemptNumber) => {
    console.log(`🔄 [${instanceId}] Reconectado após ${attemptNumber} tentativas`);
  });
  
  socket.on('reconnect_error', (error) => {
    console.error(`❌ [${instanceId}] Erro ao reconectar:`, error.message);
  });
  
  socket.on('reconnect_failed', () => {
    console.error(`❌ [${instanceId}] Falha ao reconectar após todas as tentativas`);
  });
  
  // Registrar este socket APENAS para esta aba
  // CRÍTICO: Não sobrescrever sockets de outras abas!
  socketRegistry.set(tabId, socket);
  
  console.log(`📝 [${instanceId}] Socket registrado para aba ${tabId}`);
  
  return socket;
};

/**
 * Hook para gerenciar WebSocket por aba
 * 
 * CARACTERÍSTICAS:
 * - Cada aba tem seu próprio socket isolado
 * - Sockets de diferentes abas não interferem entre si
 * - Componentes na mesma aba compartilham o mesmo socket
 * - Cleanup não desconecta o socket (permite reutilização)
 */
export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [duelFound, setDuelFound] = useState<DuelFoundData | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [duelLogs, setDuelLogs] = useState<DuelLog[]>([]);
  const [currentTurn, setCurrentTurn] = useState<number | null>(null);
  const [duelUpdate, setDuelUpdate] = useState<any>(null);
  const [duelError, setDuelError] = useState<string | null>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const listenersRef = useRef<Map<string, (...args: any[]) => void>>(new Map());
  const tabIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Obter tabId único para esta aba
    const tabId = getTabId();
    tabIdRef.current = tabId;
    
    // CRÍTICO: Verificar se já existe um socket para esta aba antes de criar novo
    // Isso evita criar múltiplos sockets quando o componente remonta
    const existingSocket = socketRegistry.get(tabId);
    
    if (existingSocket && existingSocket.connected) {
      // Já existe um socket conectado para esta aba - reutilizar
      console.log(`♻️ [useSocket:${tabId}] Reutilizando socket existente (ID: ${existingSocket.id})`);
      socketRef.current = existingSocket;
    } else {
      // Obter ou criar socket APENAS para esta aba
      socketRef.current = getSocketForCurrentTab();
    }
    
    // Atualizar estado de conexão inicial
    setIsConnected(socketRef.current.connected);
    
    // Handlers de conexão/desconexão (apenas para atualizar estado local)
    const handleConnect = () => {
      setIsConnected(true);
      console.log(`✅ [useSocket:${tabId}] Socket conectado`);
    };
    
    const handleDisconnect = () => {
      setIsConnected(false);
      console.log(`❌ [useSocket:${tabId}] Socket desconectado`);
    };
    
    socketRef.current.on('connect', handleConnect);
    socketRef.current.on('disconnect', handleDisconnect);
    
    // Configurar listeners de eventos do duelo
    const setupListeners = () => {
      const socket = socketRef.current;
      if (!socket) return;
      
      // Remover listeners antigos deste componente
      listenersRef.current.forEach((listener, event) => {
        socket.off(event, listener);
      });
      listenersRef.current.clear();
      
      // Listener para busca de duelo
      const searchingDuelListener = (data: any) => {
        console.log(`[${tabId}] Procurando duelo...`, data);
        setIsSearching(true);
      };
      socket.on('searchingDuel', searchingDuelListener);
      listenersRef.current.set('searchingDuel', searchingDuelListener);
      
      // Listener para match encontrado (ainda não criou duelo)
      const duelFoundListener = (data: any) => {
        console.log(`[${tabId}] ✅ Match encontrado!`, data);
        console.log(`[${tabId}] Tipo de data:`, typeof data);
        console.log(`[${tabId}] Dados recebidos (stringify):`, JSON.stringify(data, null, 2));
        console.log(`[${tabId}] player1Id recebido:`, data?.player1Id, 'tipo:', typeof data?.player1Id);
        console.log(`[${tabId}] player2Id recebido:`, data?.player2Id, 'tipo:', typeof data?.player2Id);
        console.log(`[${tabId}] duelId recebido:`, data?.duelId, 'tipo:', typeof data?.duelId);
        
        setIsSearching(false);
        
        // Se já tem duelId, significa que o duelo foi criado automaticamente
        // Neste caso, usar os dados como estão, mas tentar extrair player1Id e player2Id
        if (data?.duelId && !data?.player1Id && !data?.player2Id) {
          console.warn(`[${tabId}] ⚠️ Recebeu duelFound com duelId mas sem player1Id/player2Id!`);
          console.warn(`[${tabId}] ⚠️ Isso significa que o duelo foi criado automaticamente.`);
          console.warn(`[${tabId}] ⚠️ Tentando usar opponent.id para identificar os jogadores...`);
          
          // Se tem opponent.id, podemos tentar inferir
          // Mas isso não é ideal - o backend deveria enviar player1Id e player2Id
          const opponentId = data?.opponent?.id ? Number(data.opponent.id) : null;
          const currentUserId = useAuthStore.getState().user?.id;
          const currentUserIdNum = currentUserId ? (typeof currentUserId === 'string' ? parseInt(currentUserId, 10) : Number(currentUserId)) : null;
          
          if (opponentId && currentUserIdNum) {
            console.log(`[${tabId}] ✅ Inferindo player1Id e player2Id do opponent.id`);
            const matchData = {
              duelId: data.duelId,
              player1Id: currentUserIdNum,
              player2Id: opponentId,
              opponent: data?.opponent || {},
              yourTurn: data?.yourTurn || false,
              lifePoints: data?.lifePoints || 8000,
              opponentLifePoints: data?.opponentLifePoints || 8000,
              player1Field: data?.player1Field || {},
              player2Field: data?.player2Field || {},
            };
            console.log(`[${tabId}] Match data preparado (inferido):`, matchData);
            setDuelFound(matchData);
            return;
          }
        }
        
        // Garantir que os IDs sejam números
        const player1Id = data?.player1Id ? Number(data.player1Id) : null;
        const player2Id = data?.player2Id ? Number(data.player2Id) : null;
        
        // Preservar duelId como string (UUID) - não converter para número
        const duelIdPreserved = data?.duelId ? (typeof data.duelId === 'string' ? data.duelId : String(data.duelId)) : null;
        
        const matchData = {
          duelId: duelIdPreserved,
          player1Id: player1Id,
          player2Id: player2Id,
          opponent: data?.opponent || {},
          yourTurn: data?.yourTurn || false,
          lifePoints: data?.lifePoints || 8000,
          opponentLifePoints: data?.opponentLifePoints || 8000,
          player1Field: data?.player1Field || {},
          player2Field: data?.player2Field || {},
        };
        
        console.log(`[${tabId}] Match data preparado:`, matchData);
        console.log(`[${tabId}] duelId no matchData:`, matchData.duelId, '(tipo:', typeof matchData.duelId, ')');
        console.log(`[${tabId}] player1Id no matchData:`, matchData.player1Id);
        console.log(`[${tabId}] player2Id no matchData:`, matchData.player2Id);
        console.log(`[${tabId}] duelId existe?`, !!matchData.duelId);
        
        setDuelFound(matchData);
        
        // Verificar se foi setado corretamente
        setTimeout(() => {
          console.log(`[${tabId}] Verificando estado após 100ms...`);
        }, 100);
      };

      // Listener para duelo criado (quando o duelo é realmente criado)
      const duelCreatedListener = (data: DuelFoundData) => {
        console.log(`[${tabId}] ✅ Duelo criado!`, data);
        console.log(`[${tabId}] duelId recebido:`, data?.duelId, '(tipo:', typeof data?.duelId, ')');
        
        // Preservar player1Id e player2Id do estado anterior se não vierem nos dados
        setDuelFound(prev => {
          // Preservar duelId como string (UUID) - não converter para número
          const duelIdPreserved = data?.duelId ? (typeof data.duelId === 'string' ? data.duelId : String(data.duelId)) : null;
          const prevDuelId = prev?.duelId ? (typeof prev.duelId === 'string' ? prev.duelId : String(prev.duelId)) : null;
          
          const updated = {
            ...prev,
            ...data,
            duelId: duelIdPreserved || prevDuelId || null,
            // Preservar player1Id e player2Id se não vierem nos dados
            player1Id: data.player1Id || prev?.player1Id || null,
            player2Id: data.player2Id || prev?.player2Id || null,
          };
          console.log(`[${tabId}] Estado atualizado com duelId:`, updated.duelId, '(tipo:', typeof updated.duelId, ')');
          return updated;
        });
      };
      
      socket.on('duelFound', duelFoundListener);
      listenersRef.current.set('duelFound', duelFoundListener);
      
      socket.on('duelCreated', duelCreatedListener);
      listenersRef.current.set('duelCreated', duelCreatedListener);
      
      // Listener para busca cancelada
      const searchCancelledListener = () => {
        console.log(`[${tabId}] Busca cancelada`);
        setIsSearching(false);
      };
      socket.on('searchCancelled', searchCancelledListener);
      listenersRef.current.set('searchCancelled', searchCancelledListener);
      
      // Listener para mensagens de chat
      const chatMessageListener = (data: ChatMessage) => {
        setChatMessages(prev => [...prev, data]);
      };
      socket.on('chatMessage', chatMessageListener);
      listenersRef.current.set('chatMessage', chatMessageListener);
      
      // Listener para logs do duelo (payload pode ter genericMessage/forUserId para ações privadas)
      const duelLogListener = (data: { log: DuelLog; genericMessage?: string; forUserId?: number }) => {
        const entry = { ...data.log, genericMessage: data.genericMessage, forUserId: data.forUserId };
        setDuelLogs(prev => [...prev, entry]);
      };
      socket.on('duelLog', duelLogListener);
      listenersRef.current.set('duelLog', duelLogListener);
      
      // Listener para carregar logs salvos do banco quando entrar no duelo
      const duelLogsLoadedListener = (data: { logs: DuelLog[] }) => {
        console.log(`[${tabId}] 📋 Logs carregados do banco: ${data.logs.length} logs`);
        setDuelLogs(data.logs);
      };
      socket.on('duelLogsLoaded', duelLogsLoadedListener);
      listenersRef.current.set('duelLogsLoaded', duelLogsLoadedListener);
      
      // Listener para atualização de life points
      const lifePointsUpdateListener = (data: any) => {
        console.log(`[${tabId}] Life points atualizados:`, data);
      };
      socket.on('lifePointsUpdate', lifePointsUpdateListener);
      listenersRef.current.set('lifePointsUpdate', lifePointsUpdateListener);
      
      // Listener para fim do duelo
      const duelEndListener = (data: any) => {
        console.log(`[${tabId}] Duelo finalizado:`, data);
      };
      socket.on('duelEnd', duelEndListener);
      listenersRef.current.set('duelEnd', duelEndListener);
      
      // Listener para mudança de turno
      const turnChangedListener = (data: { newTurn: number; currentPlayerId: string; turnTimeLimit: number }) => {
        console.log(`[${tabId}] 🔄 Turno mudou:`, data);
        setCurrentTurn(data.newTurn);
      };
      socket.on('turnChanged', turnChangedListener);
      listenersRef.current.set('turnChanged', turnChangedListener);
      
      // Remover apenas base64 de cartas (manter path/URL para exibir imagem no duelo)
      const removeBase64FromCards = (field: any) => {
        if (!field) return field;
        const clean = { ...field };
        
        const cleanCard = (card: any) => {
          if (!card) return card;
          const cleaned = { ...card };
          if (cleaned.cardImage && typeof cleaned.cardImage === 'string' && cleaned.cardImage.startsWith('data:image')) {
            delete cleaned.cardImage;
          }
          return cleaned;
        };
        
        if (Array.isArray(clean.deck)) clean.deck = clean.deck.map(cleanCard);
        if (Array.isArray(clean.hand)) clean.hand = clean.hand.map(cleanCard);
        if (Array.isArray(clean.monsters)) clean.monsters = clean.monsters.map(cleanCard);
        if (Array.isArray(clean.spellTrap)) clean.spellTrap = clean.spellTrap.map(cleanCard);
        if (Array.isArray(clean.graveyard)) clean.graveyard = clean.graveyard.map(cleanCard);
        
        return clean;
      };
      
      // Listener para atualização do duelo
      const duelUpdateListener = (data: any) => {
        if (data.player1Field) {
          data.player1Field = removeBase64FromCards(data.player1Field);
        }
        if (data.player2Field) {
          data.player2Field = removeBase64FromCards(data.player2Field);
        }
        setDuelUpdate(data);
      };
      socket.on('duelUpdate', duelUpdateListener);
      listenersRef.current.set('duelUpdate', duelUpdateListener);
      
      // Listener para erros (para busca de duelo: para a busca e mostra a mensagem)
      const duelErrorListener = (data: { message?: string }) => {
        const msg = data?.message || 'Erro no duelo';
        console.error(`[${tabId}] ❌ Erro no duelo:`, msg);
        setIsSearching(false);
        setDuelError(msg);
      };
      socket.on('duelError', duelErrorListener);
      listenersRef.current.set('duelError', duelErrorListener);
    };
    
    setupListeners();
    
    // Cleanup: remover apenas os listeners deste componente
    // CRÍTICO: NÃO desconectar o socket - ele deve permanecer para outros componentes na mesma aba
    return () => {
      const socket = socketRef.current;
      if (socket) {
        // Remover apenas os listeners deste componente
        listenersRef.current.forEach((listener, event) => {
          socket.off(event, listener);
        });
        listenersRef.current.clear();
        
        // Remover listeners de conexão/desconexão deste componente
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        
        // NÃO desconectar o socket!
        // NÃO remover do registro!
        // O socket deve permanecer para outros componentes na mesma aba
        socketRef.current = null;
      }
    };
  }, []); // Array de dependências vazio - executa apenas uma vez

  const searchDuel = (userId: string | number, options?: { animeDeckId?: string }) => {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
    if (isNaN(userIdNum)) {
      console.error('ID de usuário inválido:', userId);
      return;
    }
    setDuelError(null);
    const payload: { userId: number; animeDeckId?: string } = { userId: userIdNum };
    if (options?.animeDeckId) payload.animeDeckId = options.animeDeckId;
    socketRef.current?.emit('searchDuel', payload);
  };

  const cancelSearch = (userId: string | number) => {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
    if (isNaN(userIdNum)) {
      console.error('ID de usuário inválido:', userId);
      return;
    }
    socketRef.current?.emit('cancelSearch', { userId: userIdNum });
    setIsSearching(false);
  };

  /** Limpa o estado "partida encontrada" para permitir fechar a tela e voltar a procurar. */
  const clearDuelFound = () => {
    setDuelFound(null);
  };

  const sendChatMessage = (duelId: string, userId: string | number, message: string) => {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
    if (isNaN(userIdNum)) {
      console.error('ID de usuário inválido:', userId);
      return;
    }
    socketRef.current?.emit('duelChat', { duelId, userId: userIdNum, message });
  };

  const performAction = (duelId: string, userId: string | number, actionType: string, actionData?: any) => {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
    if (isNaN(userIdNum)) {
      console.error('ID de usuário inválido:', userId);
      return;
    }
    socketRef.current?.emit('duelAction', { duelId, userId: userIdNum.toString(), actionType, actionData });
  };

  const updateLifePoints = (duelId: string, userId: string | number, newLifePoints: number) => {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
    if (isNaN(userIdNum)) {
      console.error('ID de usuário inválido:', userId);
      return;
    }
    socketRef.current?.emit('lifePointsChange', { duelId, userId: userIdNum.toString(), newLifePoints });
  };

  /** Socket ativo da aba: o registry é a fonte da verdade após reconexão/troca de rota. */
  const resolveConnectedSocket = useCallback((): Socket | null => {
    const tabId = getTabId();
    const registrySocket = socketRegistry.get(tabId) ?? null;
    if (registrySocket?.connected) {
      if (socketRef.current !== registrySocket) {
        socketRef.current = registrySocket;
      }
      return registrySocket;
    }
    return socketRef.current && socketRef.current.connected ? socketRef.current : null;
  }, []);

  const joinDuelRoom = (duelId: string | number, userId?: string | number) => {
    // ID agora é UUID (string), não converter para número
    const duelIdStr = typeof duelId === 'string' ? duelId : String(duelId);
    const payload: any = { duelId: duelIdStr };
    if (userId !== undefined) {
      const numericUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
      payload.userId = numericUserId;
    }

    const socket = resolveConnectedSocket();

    console.log(`📤 [useSocket] Enviando joinDuelRoom - duelId: ${duelIdStr} (tipo: ${typeof duelIdStr}), userId: ${payload.userId}`);
    console.log(`📤 [useSocket] Socket conectado (registry/ref): ${socket ? 'SIM' : 'NÃO'}`);

    if (socket) {
      socket.emit('joinDuelRoom', payload);
      console.log(`✅ [useSocket] Evento joinDuelRoom emitido com sucesso!`);
    } else {
      console.error(`❌ [useSocket] Não foi possível emitir joinDuelRoom - socket não disponível ou não conectado`);
    }
  };

  const endTurn = (duelId: string, userId: string | number) => {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
    if (isNaN(userIdNum)) {
      console.error('ID de usuário inválido:', userId);
      return;
    }
    socketRef.current?.emit('endTurn', { duelId, userId: userIdNum.toString() });
  };

  const clearDuelError = () => setDuelError(null);

  return {
    isConnected,
    isSearching,
    duelFound,
    duelError,
    clearDuelFound,
    clearDuelError,
    chatMessages,
    duelLogs,
    currentTurn,
    duelUpdate,
    searchDuel,
    cancelSearch,
    sendChatMessage,
    performAction,
    updateLifePoints,
    joinDuelRoom,
    endTurn,
    getSocket: (): Socket | null => {
      const tabId = getTabId();
      const registrySocket = socketRegistry.get(tabId) ?? null;
      if (registrySocket?.connected) {
        if (socketRef.current !== registrySocket) {
          socketRef.current = registrySocket;
        }
        return registrySocket;
      }
      return socketRef.current;
    },
  };
};
