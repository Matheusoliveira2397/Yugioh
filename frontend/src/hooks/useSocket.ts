import { useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3000';

interface DuelFoundData {
  duelId: string;
  opponent: {
    id: string;
    username: string;
    clanTag?: string;
    level: number;
    avatar?: string;
  };
  yourTurn: boolean;
  lifePoints: number;
  opponentLifePoints: number;
}

interface ChatMessage {
  username: string;
  message: string;
  timestamp: Date;
}

interface DuelLog {
  id: string;
  username: string;
  actionType: string;
  message: string;
  createdAt: Date;
}

export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [duelFound, setDuelFound] = useState<DuelFoundData | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [duelLogs, setDuelLogs] = useState<DuelLog[]>([]);
  const [currentTurn, setCurrentTurn] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Conectar ao socket
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on('connect', () => {
      console.log('Conectado ao WebSocket');
      setIsConnected(true);
    });

    socketRef.current.on('disconnect', () => {
      console.log('Desconectado do WebSocket');
      setIsConnected(false);
    });

    socketRef.current.on('searchingDuel', (data) => {
      console.log('Procurando duelo...', data);
      setIsSearching(true);
    });

    socketRef.current.on('duelFound', (data: DuelFoundData) => {
      console.log('Duelo encontrado!', data);
      setIsSearching(false);
      setDuelFound(data);
      
      // Entrar na sala do duelo
      socketRef.current?.emit('joinDuelRoom', { duelId: data.duelId });
      
      // NÃO abre automaticamente, só mostra o link
    });

    socketRef.current.on('searchCancelled', () => {
      console.log('Busca cancelada');
      setIsSearching(false);
    });

    socketRef.current.on('chatMessage', (data: ChatMessage) => {
      setChatMessages(prev => [...prev, data]);
    });

    socketRef.current.on('duelLog', (data: { log: DuelLog }) => {
      setDuelLogs(prev => [...prev, data.log]);
    });

    socketRef.current.on('lifePointsUpdate', (data) => {
      console.log('Life points atualizados:', data);
    });

    socketRef.current.on('duelEnd', (data) => {
      console.log('Duelo finalizado:', data);
    });

    socketRef.current.on('turnChanged', (data: { newTurn: number; currentPlayerId: string; turnTimeLimit: number }) => {
      console.log('🔄 Turno mudou:', data);
      setCurrentTurn(data.newTurn);
      
      // Adicionar log de turno
      const turnLog: DuelLog = {
        id: Date.now().toString(),
        username: 'Sistema',
        actionType: 'TURN_CHANGE',
        message: `Turno do Jogador ${data.newTurn}`,
        createdAt: new Date(),
      };
      setDuelLogs(prev => [...prev, turnLog]);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const searchDuel = (userId: string) => {
    socketRef.current?.emit('searchDuel', { userId });
  };

  const cancelSearch = (userId: string) => {
    socketRef.current?.emit('cancelSearch', { userId });
    setIsSearching(false);
  };

  const sendChatMessage = (duelId: string, userId: string, message: string) => {
    socketRef.current?.emit('duelChat', { duelId, userId, message });
  };

  const performAction = (duelId: string, userId: string, actionType: string, actionData?: any) => {
    socketRef.current?.emit('duelAction', { duelId, userId, actionType, actionData });
  };

  const updateLifePoints = (duelId: string, userId: string, newLifePoints: number) => {
    socketRef.current?.emit('lifePointsChange', { duelId, userId, newLifePoints });
  };

  const joinDuelRoom = (duelId: string) => {
    console.log('Entrando na sala do duelo via socket:', duelId);
    socketRef.current?.emit('joinDuelRoom', { duelId });
  };

  const endTurn = (duelId: string, userId: string) => {
    console.log('🔄 Finalizando turno via socket:', { duelId, userId });
    socketRef.current?.emit('endTurn', { duelId, userId });
  };

  return {
    isConnected,
    isSearching,
    duelFound,
    chatMessages,
    duelLogs,
    currentTurn,
    searchDuel,
    cancelSearch,
    sendChatMessage,
    performAction,
    updateLifePoints,
    joinDuelRoom,
    endTurn,
  };
};
