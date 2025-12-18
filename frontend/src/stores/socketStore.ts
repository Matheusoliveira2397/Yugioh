import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  connect: (token: string) => void;
  disconnect: () => void;
  emit: (event: string, data: any) => void;
  on: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string) => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,

  connect: (token: string) => {
    const { socket: existingSocket } = get();
    
    // Se já existe um socket conectado, reutilizar (não criar novo)
    // Isso permite que múltiplas abas compartilhem a mesma conexão se necessário
    if (existingSocket && existingSocket.connected) {
      console.log('Socket já está conectado, reutilizando...');
      return;
    }
    
    // Se existe mas não está conectado, apenas tentar reconectar
    // NÃO desconectar - pode estar sendo usado por outra aba
    if (existingSocket && !existingSocket.connected) {
      console.log('Socket existe mas não está conectado. Tentando reconectar...');
      existingSocket.connect();
      return;
    }
    
    // Criar nova conexão apenas se não existir nenhuma
    const socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      set({ isConnected: true });
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      set({ isConnected: false });
      
      // Reconectar automaticamente se não foi desconexão intencional
      if (reason === 'io server disconnect') {
        console.log('Servidor forçou desconexão, tentando reconectar...');
        socket.connect();
      }
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log(`Socket reconnected after ${attemptNumber} attempts`);
      set({ isConnected: true });
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`Socket reconnection attempt ${attemptNumber}...`);
    });

    socket.on('reconnect_error', (error) => {
      console.error('Socket reconnection error:', error.message);
    });

    socket.on('reconnect_failed', () => {
      console.error('Socket reconnection failed after all attempts');
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  emit: (event: string, data: any) => {
    const { socket } = get();
    if (socket) {
      socket.emit(event, data);
    }
  },

  on: (event: string, callback: (...args: any[]) => void) => {
    const { socket } = get();
    if (socket) {
      socket.on(event, callback);
    }
  },

  off: (event: string, callback?: (...args: any[]) => void) => {
    const { socket } = get();
    if (socket) {
      if (callback) {
        socket.off(event, callback);
      } else {
        socket.off(event);
      }
    }
  },
}));
