import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';
import { useAuthStore } from '../stores/authStore';

/**
 * Serviço Singleton para gerenciar conexão WebSocket de duelos
 * 
 * CARACTERÍSTICAS:
 * - Uma instância por aba (singleton por aba)
 * - Reconexão automática configurada
 * - Envia clientInstanceId único no auth
 * - Compartilhado entre todos os componentes da mesma aba
 */
@Injectable({
  providedIn: 'root'
})
export class DuelSocketService {
  private socket: Socket | null = null;
  private clientInstanceId: string | null = null;
  private isConnected$ = new BehaviorSubject<boolean>(false);
  private readonly SOCKET_URL = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000';

  constructor() {
    this.initializeSocket();
  }

  /**
   * Gera ou obtém clientInstanceId único para esta aba
   */
  private getClientInstanceId(): string {
    if (this.clientInstanceId) {
      return this.clientInstanceId;
    }

    const STORAGE_KEY = 'socket_client_instance_id';
    let clientInstanceId = sessionStorage.getItem(STORAGE_KEY);

    if (!clientInstanceId) {
      // Gerar UUID v4 único
      clientInstanceId = this.generateUUID();
      sessionStorage.setItem(STORAGE_KEY, clientInstanceId);
      console.log(`🆔 [DuelSocketService] Nova instância de cliente: ${clientInstanceId}`);
    }

    this.clientInstanceId = clientInstanceId;
    return clientInstanceId;
  }

  /**
   * Gera UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Inicializa o socket (chamado apenas uma vez no construtor)
   */
  private initializeSocket(): void {
    const token = useAuthStore.getState().token;
    if (!token) {
      console.warn('⚠️ [DuelSocketService] Token não encontrado, socket não será criado');
      return;
    }

    const clientInstanceId = this.getClientInstanceId();
    console.log(`🔌 [DuelSocketService] Inicializando socket com clientInstanceId: ${clientInstanceId}`);

    this.socket = io(this.SOCKET_URL, {
      auth: {
        token,
        clientInstanceId, // Enviar clientInstanceId no auth
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      forceNew: true, // Força nova conexão por aba
    });

    this.setupEventListeners();
  }

  /**
   * Configura listeners de eventos do socket
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log(`✅ [DuelSocketService] Socket conectado: ${this.socket?.id}`);
      this.isConnected$.next(true);
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`❌ [DuelSocketService] Socket desconectado: ${reason}`);
      this.isConnected$.next(false);
      
      // Socket.IO gerencia reconexão automaticamente
      // Não tentar reconectar manualmente aqui
    });

    this.socket.on('connect_error', (error) => {
      console.error(`❌ [DuelSocketService] Erro de conexão:`, error.message);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 [DuelSocketService] Reconectado após ${attemptNumber} tentativas`);
      this.isConnected$.next(true);
    });

    this.socket.on('reconnect_error', (error) => {
      console.error(`❌ [DuelSocketService] Erro ao reconectar:`, error.message);
    });

    this.socket.on('reconnect_failed', () => {
      console.error(`❌ [DuelSocketService] Falha ao reconectar após todas as tentativas`);
    });
  }

  /**
   * Obtém o socket (singleton)
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Observable para estado de conexão
   */
  getConnectionStatus(): Observable<boolean> {
    return this.isConnected$.asObservable();
  }

  /**
   * Verifica se está conectado
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Emite evento
   */
  emit(event: string, data: any): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn(`⚠️ [DuelSocketService] Tentativa de emitir evento '${event}' mas socket não está conectado`);
    }
  }

  /**
   * Registra listener de evento
   */
  on(event: string, callback: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  /**
   * Remove listener de evento
   */
  off(event: string, callback?: (...args: any[]) => void): void {
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.off(event);
      }
    }
  }

  /**
   * Desconecta o socket (apenas se necessário)
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected$.next(false);
    }
  }
}

