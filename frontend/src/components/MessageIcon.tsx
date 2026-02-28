import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { useSocketStore } from '../stores/socketStore';

interface MessageNotification {
  id: string;
  senderId: string;
  senderName: string;
  senderClanTag?: string;
  senderProfileImage?: string;
  content: string;
  createdAt: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function MessageIcon() {
  const { token, user } = useAuthStore();
  const navigate = useNavigate();
  const { connect, on, getSocket, isConnected } = useSocketStore();
  const [messageNotifications, setMessageNotifications] = useState<MessageNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

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

      return () => {
        socketInstance.off('privateMessage', handlePrivateMessage);
      };
    }

    return () => {
      if (socket) {
        socket.off('privateMessage');
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

  return (
    <div className="relative z-[100]" ref={dropdownRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-1.5 hover:bg-blue-500/20 rounded-lg transition-colors"
      >
        <svg className="w-4 h-4 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {messageNotifications.length > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {messageNotifications.length > 9 ? '9+' : messageNotifications.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed w-80 bg-slate-800 border border-blue-500/30 rounded-xl shadow-2xl z-[100] max-h-96 overflow-hidden"
            style={{ top: `${dropdownPosition.top}px`, right: `${dropdownPosition.right}px` }}
          >
            <div className="p-4 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Mensagens</h3>
                {messageNotifications.length > 0 && (
                  <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                    {messageNotifications.length}
                  </span>
                )}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {messageNotifications.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-4xl mb-2">💬</p>
                  <p>Nenhuma mensagem nova</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700">
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
                </div>
              )}
            </div>

            {messageNotifications.length > 0 && (
              <div className="p-3 border-t border-slate-700">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    navigate('/friends');
                  }}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white font-semibold text-sm"
                >
                  Ver todas as mensagens
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

