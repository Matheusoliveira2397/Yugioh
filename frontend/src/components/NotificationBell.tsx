import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSocketStore } from '../stores/socketStore';
import { getImageUrl } from '../utils/imageUrl';

interface FriendRequest {
  id: string;
  user: {
    id: number;
    username: string;
    nickname: string;
    clanTag?: string;
    profileImage?: string;
  };
  createdAt: string;
}

interface SystemNotification {
  id: string;
  type: string;
  content: string;
  createdAt: string;
}

const NOTIFICATIONS_STORAGE_KEY = 'yugioh_system_notifications';
const NOTIFICATIONS_MAX = 50;

function loadStoredNotifications(userId: number | string | undefined): SystemNotification[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(`${NOTIFICATIONS_STORAGE_KEY}_${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredNotifications(userId: number | string | undefined, list: SystemNotification[]) {
  if (!userId) return;
  try {
    localStorage.setItem(`${NOTIFICATIONS_STORAGE_KEY}_${userId}`, JSON.stringify(list.slice(0, NOTIFICATIONS_MAX)));
  } catch {
    // ignore
  }
}

export default function NotificationBell() {
  const { token, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { connect, on, getSocket, isConnected } = useSocketStore();
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [systemNotifications, setSystemNotifications] = useState<SystemNotification[]>(() =>
    loadStoredNotifications(user?.id)
  );
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  // Buscar solicitações pendentes
  const fetchPendingRequests = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const response = await api.get('/friends/pending');
      setPendingRequests(response.data.received || []);
    } catch (error) {
      console.error('Erro ao carregar solicitações:', error);
      setPendingRequests([]);
    } finally {
      setLoading(false);
    }
  };

  // Buscar notificações do sistema no servidor (ex.: cash semanal do clã) e mesclar com as locais
  const fetchServerNotifications = async () => {
    if (!token || !user?.id) return;
    try {
      const response = await api.get<SystemNotification[]>('/users/me/notifications', {
        params: { limit: NOTIFICATIONS_MAX },
      });
      const fromServer = Array.isArray(response.data) ? response.data : [];
      setSystemNotifications((prev) => {
        const byId = new Map(prev.map((n) => [n.id, n]));
        for (const n of fromServer) {
          if (n?.id && !byId.has(n.id)) byId.set(n.id, { id: n.id, type: n.type || 'system', content: n.content, createdAt: n.createdAt });
        }
        return Array.from(byId.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, NOTIFICATIONS_MAX);
      });
    } catch (err) {
      console.error('Erro ao carregar notificações do servidor:', err);
    }
  };

  // Carregar notificações salvas ao mudar de usuário e buscar as do servidor
  useEffect(() => {
    if (user?.id) {
      setSystemNotifications(loadStoredNotifications(user.id));
      fetchServerNotifications();
    }
  }, [user?.id]);

  // Persistir notificações sempre que a lista mudar
  useEffect(() => {
    if (user?.id && systemNotifications.length >= 0) {
      saveStoredNotifications(user.id, systemNotifications);
    }
  }, [user?.id, systemNotifications]);

  useEffect(() => {
    fetchPendingRequests();
    const interval = setInterval(fetchPendingRequests, 30000);
    return () => clearInterval(interval);
  }, [token]);

  // Escutar mensagens do sistema via WebSocket
  useEffect(() => {
    if (!user || !token) return;

    // Conectar ao socket se não estiver conectado
    if (!isConnected) {
      connect(token);
    }

    const socket = getSocket();
    if (!socket) {
      // Tentar novamente após um pequeno delay
      const timeout = setTimeout(() => {
        const newSocket = getSocket();
        if (newSocket) {
          setupListeners(newSocket);
        }
      }, 1000);
      return () => clearTimeout(timeout);
    }

    setupListeners(socket);

    // Solicitar permissão para notificações do navegador
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    function setupListeners(socketInstance: any) {
      const handleSystemMessage = (data: SystemNotification) => {
        setSystemNotifications(prev => {
          if (prev.some(n => n.id === data.id)) return prev;
          return [data, ...prev].slice(0, NOTIFICATIONS_MAX);
        });
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('📢 Mensagem do Sistema', {
            body: data.content.length > 50 ? data.content.substring(0, 50) + '...' : data.content,
            icon: '/images/yugioh.webp',
          });
        }
      };

      const handleFriendRequestReceived = () => {
        fetchPendingRequests();
      };

      socketInstance.on('systemMessage', handleSystemMessage);
      socketInstance.on('friendRequestReceived', handleFriendRequestReceived);

      return () => {
        socketInstance.off('systemMessage', handleSystemMessage);
        socketInstance.off('friendRequestReceived', handleFriendRequestReceived);
      };
    }

    setupListeners(socket);

    return () => {
      if (socket) {
        socket.off('systemMessage');
        socket.off('friendRequestReceived');
      }
    };
  }, [user, token, isConnected, connect, getSocket]);

  // Calcular posição do dropdown
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [isOpen]);


  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAcceptRequest = async (requestId: string) => {
    if (!token) return;
    try {
      await api.put(`/friends/${requestId}/accept`, {});
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (error) {
      console.error('Erro ao aceitar solicitação:', error);
      alert('Erro ao aceitar solicitação');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    if (!token) return;
    try {
      await api.put(`/friends/${requestId}/reject`, {});
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (error) {
      console.error('Erro ao rejeitar solicitação:', error);
      alert('Erro ao rejeitar solicitação');
    }
  };

  const handleViewAll = () => {
    setIsOpen(false);
    navigate('/friends');
  };

  return (
    <div className="relative z-[100]" ref={dropdownRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-1.5 hover:bg-purple-500/20 rounded-lg transition-colors"
      >
        <svg className="w-4 h-4 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {(pendingRequests.length > 0 || systemNotifications.length > 0) && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {pendingRequests.length + systemNotifications.length > 9 ? '9+' : pendingRequests.length + systemNotifications.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed w-80 bg-slate-800 border border-purple-500/30 rounded-xl shadow-2xl z-[100] max-h-96 overflow-hidden"
            style={{ top: `${dropdownPosition.top}px`, right: `${dropdownPosition.right}px` }}
          >
            <div className="p-4 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Notificações</h3>
                {(pendingRequests.length > 0 || systemNotifications.length > 0) && (
                  <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                    {pendingRequests.length + systemNotifications.length}
                  </span>
                )}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
                </div>
              ) : pendingRequests.length === 0 && systemNotifications.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-4xl mb-2">📭</p>
                  <p>Nenhuma notificação</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700">
                  {/* Notificações do Sistema */}
                  {systemNotifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-4 hover:bg-slate-700/50 transition-colors cursor-pointer bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-l-4 border-yellow-500"
                      onClick={() => {
                        // Remover a notificação ao clicar
                        setSystemNotifications(prev => prev.filter(n => n.id !== notification.id));
                        setIsOpen(false);
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center flex-shrink-0">
                          <span className="text-xl">📢</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-yellow-400 mb-1">
                            Mensagem do Sistema
                          </p>
                          <p className="text-xs text-gray-300">{notification.content}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(notification.createdAt).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSystemNotifications(prev => prev.filter(n => n.id !== notification.id));
                          }}
                          className="text-gray-400 hover:text-white transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </motion.div>
                  ))}

                  {/* Solicitações de Amizade */}
                  {pendingRequests.map((request) => (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-4 hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <img
                          src={getImageUrl(request.user.profileImage)}
                          alt={request.user.nickname}
                          className="w-10 h-10 rounded-full border-2 border-yellow-500 object-cover"
                          onError={(e) => {
                            e.currentTarget.src = '/images/default.png';
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white">
                            {request.user.clanTag ? `|${request.user.clanTag}| ${request.user.nickname}` : request.user.nickname}
                          </p>
                          <p className="text-xs text-gray-400">enviou uma solicitação de amizade</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(request.createdAt).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAcceptRequest(request.id)}
                          className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-white font-semibold text-xs"
                        >
                          ✓ Aceitar
                        </button>
                        <button
                          onClick={() => handleRejectRequest(request.id)}
                          className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-white font-semibold text-xs"
                        >
                          ✕ Rejeitar
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {(pendingRequests.length > 0 || systemNotifications.length > 0) && (
              <div className="p-3 border-t border-slate-700">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    navigate('/friends');
                  }}
                  className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors text-white font-semibold text-sm"
                >
                  Ver todas as notificações
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

