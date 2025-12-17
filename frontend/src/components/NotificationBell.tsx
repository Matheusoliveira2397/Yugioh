import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSocketStore } from '../stores/socketStore';

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

interface MessageNotification {
  id: string;
  senderId: string;
  senderName: string;
  senderClanTag?: string;
  senderProfileImage?: string;
  content: string;
  createdAt: string;
}

interface SystemNotification {
  id: string;
  type: 'system';
  content: string;
  createdAt: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function NotificationBell() {
  const { token, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { connect, on, getSocket, isConnected } = useSocketStore();
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [messageNotifications, setMessageNotifications] = useState<MessageNotification[]>([]);
  const [systemNotifications, setSystemNotifications] = useState<SystemNotification[]>([]);
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
      const response = await axios.get(`${API_URL}/friends/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPendingRequests(response.data.received || []);
    } catch (error) {
      console.error('Erro ao carregar solicitações:', error);
      setPendingRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingRequests();
    // Atualizar a cada 30 segundos
    const interval = setInterval(fetchPendingRequests, 30000);
    return () => clearInterval(interval);
  }, [token]);

  // Escutar mensagens privadas via WebSocket
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
          setupMessageListener(newSocket);
        }
      }, 1000);
      return () => clearTimeout(timeout);
    }

    setupMessageListener(socket);

    // Solicitar permissão para notificações do navegador
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    function setupMessageListener(socketInstance: any) {
      const currentUserId = typeof user.id === 'string' ? user.id : user.id.toString();

      const handlePrivateMessage = (data: any) => {
        const senderId = data.userId || data.senderId;
        
        // Ignorar se a mensagem foi enviada por mim
        if (senderId === currentUserId) return;

        // Adicionar notificação de mensagem
        const notification: MessageNotification = {
          id: data.id || `msg-${Date.now()}-${Math.random()}`,
          senderId: senderId.toString(),
          senderName: data.nickname || data.username || 'Alguém',
          senderClanTag: data.clanTag,
          senderProfileImage: data.profileImage,
          content: data.content || data.message || '',
          createdAt: data.createdAt || new Date().toISOString(),
        };

        setMessageNotifications(prev => {
          // Evitar duplicatas
          if (prev.some(n => n.id === notification.id)) {
            return prev;
          }
          // Manter apenas as últimas 10 notificações
          return [notification, ...prev].slice(0, 10);
        });

        // Mostrar notificação do navegador se permitido
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`Nova mensagem de ${notification.senderName}`, {
            body: notification.content.length > 50 
              ? notification.content.substring(0, 50) + '...' 
              : notification.content,
            icon: notification.senderProfileImage ? `${API_URL}${notification.senderProfileImage}` : undefined,
          });
        }
      };

      socketInstance.on('privateMessage', handlePrivateMessage);

      // Escutar mensagens do sistema
      const handleSystemMessage = (data: SystemNotification) => {
        setSystemNotifications(prev => {
          // Evitar duplicatas
          if (prev.some(n => n.id === data.id)) {
            return prev;
          }
          // Manter apenas as últimas 10 notificações do sistema
          return [data, ...prev].slice(0, 10);
        });

        // Mostrar notificação do navegador se permitido
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('📢 Mensagem do Sistema', {
            body: data.content.length > 50 
              ? data.content.substring(0, 50) + '...' 
              : data.content,
            icon: '/images/yugioh.webp',
          });
        }
      };

      socketInstance.on('systemMessage', handleSystemMessage);

      return () => {
        socketInstance.off('privateMessage', handlePrivateMessage);
        socketInstance.off('systemMessage', handleSystemMessage);
      };
    }

    return () => {
      if (socket) {
        socket.off('privateMessage');
        socket.off('systemMessage');
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

  // Escutar eventos de mensagem visualizada
  useEffect(() => {
    const handleMessageViewed = (event: CustomEvent) => {
      const { senderId } = event.detail;
      // Remover notificações deste remetente
      setMessageNotifications(prev => prev.filter(n => n.senderId !== senderId.toString()));
    };

    window.addEventListener('messageViewed' as any, handleMessageViewed);
    return () => {
      window.removeEventListener('messageViewed' as any, handleMessageViewed);
    };
  }, []);

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
      await axios.put(
        `${API_URL}/friends/${requestId}/accept`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (error) {
      console.error('Erro ao aceitar solicitação:', error);
      alert('Erro ao aceitar solicitação');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    if (!token) return;
    try {
      await axios.put(
        `${API_URL}/friends/${requestId}/reject`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
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
        {(pendingRequests.length > 0 || messageNotifications.length > 0 || systemNotifications.length > 0) && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {pendingRequests.length + messageNotifications.length + systemNotifications.length > 9 ? '9+' : pendingRequests.length + messageNotifications.length + systemNotifications.length}
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
                {(pendingRequests.length > 0 || messageNotifications.length > 0 || systemNotifications.length > 0) && (
                  <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                    {pendingRequests.length + messageNotifications.length + systemNotifications.length}
                  </span>
                )}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
                </div>
              ) : pendingRequests.length === 0 && messageNotifications.length === 0 && systemNotifications.length === 0 ? (
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

                  {/* Notificações de Mensagens */}
                  {messageNotifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-4 hover:bg-slate-700/50 transition-colors cursor-pointer"
                      onClick={() => {
                        // Remover a notificação ao clicar
                        setMessageNotifications(prev => prev.filter(n => n.id !== notification.id));
                        setIsOpen(false);
                        navigate(`/friends?selectedFriendId=${notification.senderId}`);
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <img
                          src={notification.senderProfileImage ? `${API_URL}${notification.senderProfileImage}` : '/images/default.png'}
                          alt={notification.senderName}
                          className="w-10 h-10 rounded-full border-2 border-blue-500 object-cover"
                          onError={(e) => {
                            e.currentTarget.src = '/images/default.png';
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white">
                            {notification.senderClanTag ? `|${notification.senderClanTag}| ${notification.senderName}` : notification.senderName}
                          </p>
                          <p className="text-xs text-gray-400 line-clamp-2">{notification.content}</p>
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
                            setMessageNotifications(prev => prev.filter(n => n.id !== notification.id));
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
                          src={request.user.profileImage ? `${API_URL}${request.user.profileImage}` : '/images/default.png'}
                          alt={request.user.username}
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

            {(pendingRequests.length > 0 || messageNotifications.length > 0 || systemNotifications.length > 0) && (
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

