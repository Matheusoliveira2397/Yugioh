import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSocketStore } from '../stores/socketStore';
import api from '../api/axios';
import { getProfileImageUrl, DEFAULT_PROFILE_IMAGE_PATH } from '../utils/imageUrl';
import { formatScore } from '../utils/formatScore';
import { useI18n } from '../i18n/I18nContext';

interface Friend {
  id: number | string;
  username?: string;
  nickname: string;
  clanTag?: string;
  profileImage: string | null;
  isOnline: boolean;
  level: number;
  totalScore?: number;
}

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  read: boolean;
}

interface Conversation {
  friend: Friend;
  messages: Message[];
  unreadCount: number;
}

interface FriendRequest {
  id: string;
  user: Friend;
  createdAt: string;
}

export default function FriendsPage() {
  const { t } = useI18n();
  const { user, token } = useAuthStore();
  const { connect, getSocket, isConnected } = useSocketStore();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [conversations, setConversations] = useState<Map<string, Conversation>>(new Map());
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'online' | 'all' | 'requests'>('online');
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Buscar lista de amigos
  useEffect(() => {
    const fetchFriends = async () => {
      if (!token) return;
      try {
        setLoading(true);
        const response = await api.get('/friends');
        // Garantir que os dados estão no formato correto
        const friendsData = Array.isArray(response.data) ? response.data : [];
        setFriends(friendsData.map((friend: any) => ({
          id: friend.id,
          nickname: friend.nickname,
          clanTag: friend.clanTag,
          profileImage: friend.profileImage || null,
          isOnline: friend.isOnline || false,
          level: friend.level || 1,
          totalScore: friend.totalScore || 0,
        })));
      } catch (error) {
        console.error('Erro ao carregar amigos:', error);
        setFriends([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFriends();
  }, [token]);

  // Buscar solicitações pendentes
  const fetchPendingRequests = async () => {
    if (!token?.trim() || !user?.id) return;
    try {
      setLoadingRequests(true);
      const response = await api.get('/friends/pending');
      setPendingRequests(response.data.received || []);
    } catch (error: any) {
      const st = error?.response?.status;
      if (st !== 401) {
        console.error('Erro ao carregar solicitações:', error);
      }
      setPendingRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'requests') {
      fetchPendingRequests();
    }
  }, [token, user?.id, activeTab]);

  // Atualizar lista quando chegar solicitação em tempo real
  useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) return;
    const onReceived = () => fetchPendingRequests();
    socket.on('friendRequestReceived', onReceived);
    return () => { socket.off('friendRequestReceived', onReceived); };
  }, [token, getSocket]);

  const handleAcceptRequest = async (requestId: string) => {
    if (!token) return;
    try {
      await api.put(`/friends/${requestId}/accept`, {});
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
      const response = await api.get('/friends');
      const friendsData = Array.isArray(response.data) ? response.data : [];
      setFriends(friendsData.map((friend: any) => ({
        id: friend.id,
        nickname: friend.nickname,
        clanTag: friend.clanTag,
        profileImage: friend.profileImage || null,
        isOnline: friend.isOnline || false,
        level: friend.level || 1,
        totalScore: friend.totalScore || 0,
      })));
    } catch (error) {
      console.error('Erro ao aceitar solicitação:', error);
      alert('Erro ao aceitar solicitação');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    if (!token) return;
    try {
      await api.put(`/friends/${requestId}/reject`, {});
      // Remover da lista
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (error) {
      console.error('Erro ao rejeitar solicitação:', error);
      alert('Erro ao rejeitar solicitação');
    }
  };

  // Buscar mensagens quando seleciona um amigo
  useEffect(() => {
    if (selectedFriend) {
      fetchMessages(selectedFriend.id);
      // Disparar evento para remover notificações deste remetente
      const event = new CustomEvent('messageViewed', { detail: { senderId: selectedFriend.id } });
      window.dispatchEvent(event);
    }
  }, [selectedFriend]);

  const currentConversation = selectedFriend ? conversations.get(selectedFriend.id) : null;

  // Escutar mensagens em tempo real via WebSocket
  useEffect(() => {
    if (!user || !token) return;

    // Conectar ao socket se não estiver conectado
    if (!isConnected) {
      connect(token);
    }

    const socket = getSocket();
    if (!socket) return;

    const currentUserId = typeof user.id === 'string' ? user.id : user.id.toString();

    const handlePrivateMessage = (data: any) => {
      const senderId = data.senderId || data.userId;
      const receiverId = data.receiverId;
      
      // Verificar se a mensagem é para mim
      if (receiverId !== currentUserId) return;

      // Adicionar mensagem à conversa correspondente
      setConversations(prev => {
        const newMap = new Map(prev);
        const friendId = senderId.toString();
        const conversation = newMap.get(friendId);
        
        // Filtrar mensagens com mais de 24 horas
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        if (conversation) {
          // Verificar se a mensagem já existe (evitar duplicatas)
          if (!conversation.messages.some(m => m.id === data.id)) {
            const allMessages = [...conversation.messages, {
              id: data.id,
              senderId: senderId.toString(),
              receiverId: receiverId.toString(),
              content: data.content,
              createdAt: data.createdAt || new Date().toISOString(),
              read: data.read || false,
            }];
            
            // Filtrar mensagens com mais de 24 horas e manter apenas as últimas 20
            const filteredMessages = allMessages
              .filter(msg => {
                const msgDate = new Date(msg.createdAt);
                return msgDate >= twentyFourHoursAgo;
              })
              .slice(-20);
            
            conversation.messages = filteredMessages;
          } else {
            // Mesmo se a mensagem já existe, filtrar as antigas
            const filteredMessages = conversation.messages
              .filter(msg => {
                const msgDate = new Date(msg.createdAt);
                return msgDate >= twentyFourHoursAgo;
              })
              .slice(-20);
            conversation.messages = filteredMessages;
          }
        } else {
          // Se não há conversa, buscar informações do amigo
          const friend = friends.find(f => f.id.toString() === friendId);
          if (friend) {
            const newMessage = {
              id: data.id,
              senderId: senderId.toString(),
              receiverId: receiverId.toString(),
              content: data.content,
              createdAt: data.createdAt || new Date().toISOString(),
              read: data.read || false,
            };
            
            // Verificar se a mensagem tem menos de 24 horas
            const msgDate = new Date(newMessage.createdAt);
            if (msgDate >= twentyFourHoursAgo) {
              newMap.set(friendId, {
                friend,
                messages: [newMessage],
                unreadCount: 0,
              });
            }
          }
        }
        
        return newMap;
      });

      // Scroll automático se a conversa estiver aberta
      if (selectedFriend && selectedFriend.id.toString() === senderId.toString()) {
        // Disparar evento para remover notificações deste remetente quando a conversa estiver aberta
        const event = new CustomEvent('messageViewed', { detail: { senderId: senderId } });
        window.dispatchEvent(event);
        
        setTimeout(() => {
          const container = document.getElementById('messages-container');
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        }, 100);
      }
    };

    socket.on('privateMessage', handlePrivateMessage);

    return () => {
      socket.off('privateMessage', handlePrivateMessage);
    };
  }, [user, token, isConnected, connect, getSocket, friends, selectedFriend]);

  // Scroll automático para a última mensagem
  useEffect(() => {
    if (selectedFriend && currentConversation) {
      const container = document.getElementById('messages-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [currentConversation?.messages, selectedFriend]);

  const fetchMessages = async (friendId: string | number) => {
    try {
      const friendIdNum = typeof friendId === 'string' ? parseInt(friendId, 10) : Number(friendId);
      if (isNaN(friendIdNum)) {
        console.error('ID de amigo inválido:', friendId);
        return;
      }
      const response = await api.get(`/messages/${friendIdNum}`);
      
      // Remover duplicatas baseado no ID
      const uniqueMessages = response.data.filter((msg: Message, index: number, self: Message[]) => 
        index === self.findIndex((m: Message) => m.id === msg.id)
      );
      
      // Filtrar mensagens com mais de 24 horas e manter apenas as últimas 20
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const filteredMessages = uniqueMessages
        .filter((msg: Message) => {
          const msgDate = new Date(msg.createdAt);
          return msgDate >= twentyFourHoursAgo;
        })
        .slice(-20);
      
      const conversation: Conversation = {
        friend: selectedFriend!,
        messages: filteredMessages,
        unreadCount: 0
      };
      
      setConversations(prev => new Map(prev).set(friendId, conversation));
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
      // Mensagens mockadas
      if (!user) return;
      
      const mockMessages: Message[] = [
        {
          id: '1',
          senderId: friendId,
          receiverId: user.id,
          content: 'E aí! Bora duelar?',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          read: true
        },
        {
          id: '2',
          senderId: user.id,
          receiverId: friendId,
          content: 'Bora sim! Vou montar meu deck.',
          createdAt: new Date(Date.now() - 1800000).toISOString(),
          read: true
        }
      ];
      
      setConversations(prev => new Map(prev).set(friendId, {
        friend: selectedFriend!,
        messages: mockMessages,
        unreadCount: 0
      }));
    }
  };

  const sendMessage = async () => {
    if (!messageInput.trim() || !selectedFriend || !user) return;

    const messageContent = messageInput.trim();
    const receiverId = typeof selectedFriend.id === 'string' ? parseInt(selectedFriend.id, 10) : Number(selectedFriend.id);
    
    if (isNaN(receiverId)) {
      console.error('ID de destinatário inválido:', selectedFriend.id);
      alert('Erro: ID de destinatário inválido');
      return;
    }

    // Adicionar mensagem otimisticamente (antes da resposta do servidor)
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      senderId: typeof user.id === 'string' ? user.id : user.id.toString(),
      receiverId: receiverId.toString(),
      content: messageContent,
      createdAt: new Date().toISOString(),
      read: false
    };

    setConversations(prev => {
      const newMap = new Map(prev);
      const conversation = newMap.get(selectedFriend.id);
      if (conversation) {
        conversation.messages.push(tempMessage);
      }
      return newMap;
    });

    setMessageInput('');

    try {
      const response = await api.post('/messages', {
        receiverId: receiverId.toString(),
        content: messageContent,
      });

      const newMessage: Message = response.data;
      
      // Substituir mensagem temporária pela mensagem real do servidor
      setConversations(prev => {
        const newMap = new Map(prev);
        const conversation = newMap.get(selectedFriend.id);
        if (conversation) {
          // Remover mensagem temporária
          conversation.messages = conversation.messages.filter(m => m.id !== tempMessage.id);
          // Verificar se a mensagem do servidor já existe (evitar duplicatas)
          const existingIndex = conversation.messages.findIndex(m => m.id === newMessage.id);
          if (existingIndex === -1) {
            conversation.messages.push(newMessage);
          } else {
            // Se já existe, atualizar
            conversation.messages[existingIndex] = newMessage;
          }
        }
        return newMap;
      });
    } catch (error: any) {
      console.error('Erro ao enviar mensagem:', error);
      
      // Remover mensagem temporária em caso de erro
      setConversations(prev => {
        const newMap = new Map(prev);
        const conversation = newMap.get(selectedFriend.id);
        if (conversation) {
          conversation.messages = conversation.messages.filter(m => m.id !== tempMessage.id);
        }
        return newMap;
      });

      // Restaurar mensagem no input
      setMessageInput(messageContent);
      
      const errorMessage = error.response?.data?.message || error.message || 'Erro ao enviar mensagem';
      alert(`Erro: ${errorMessage}`);
    }
  };

  const filteredFriends = friends.filter(friend => 
    activeTab === 'online' ? friend.isOnline : true
  );

  return (
    <div className="min-h-screen p-6 relative z-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">
            👥 {t('friends.title')}
          </h1>
          <p className="text-gray-300">{t('friends.subtitle')}</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de Amigos */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-1"
          >
            <div className="rounded-xl border border-purple-500/30 overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-slate-700">
                <button
                  onClick={() => setActiveTab('online')}
                  className={`flex-1 py-3 px-4 font-semibold transition-colors text-xs ${
                    activeTab === 'online'
                      ? 'bg-green-600/20 text-green-400 border-b-2 border-green-400'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🟢 {t('friends.online')} ({friends.filter(f => f.isOnline).length})
                </button>
                <button
                  onClick={() => setActiveTab('all')}
                  className={`flex-1 py-3 px-4 font-semibold transition-colors text-xs ${
                    activeTab === 'all'
                      ? 'bg-purple-600/20 text-purple-400 border-b-2 border-purple-400'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  📋 {t('friends.all')} ({friends.length})
                </button>
                <button
                  onClick={() => setActiveTab('requests')}
                  className={`flex-1 py-3 px-4 font-semibold transition-colors text-xs relative ${
                    activeTab === 'requests'
                      ? 'bg-yellow-600/20 text-yellow-400 border-b-2 border-yellow-400'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🔔 {t('friends.requests')}
                  {pendingRequests.length > 0 && (
                    <span className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {pendingRequests.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Lista */}
              <div className="max-h-[600px] overflow-y-auto">
                {activeTab === 'requests' ? (
                  loadingRequests ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
                    </div>
                  ) : pendingRequests.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <p className="text-4xl mb-2">📭</p>
                      <p>{t('friends.noRequests')}</p>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {pendingRequests.map((request) => (
                        <motion.div
                          key={request.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="p-4 border-b border-slate-700/50"
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <img
                              src={getProfileImageUrl(request.user.profileImage)}
                              alt={request.user.nickname}
                              className="w-12 h-12 rounded-full border-2 border-yellow-500 object-cover"
                              onError={(e) => {
                                e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-white truncate">
                                <Link to={`/profile/${request.user.id}`} className="hover:text-purple-400 transition-colors cursor-pointer">
                                  {request.user.clanTag ? `|${request.user.clanTag}| ${request.user.nickname}` : request.user.nickname}
                                </Link>
                              </p>
                              <p className="text-sm text-gray-400 truncate">{request.user.nickname}</p>
                              <p className="text-xs text-gray-500">
                                {new Date(request.createdAt).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAcceptRequest(request.id)}
                              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-white font-semibold text-sm"
                            >
                              ✓ {t('friends.accept')}
                            </button>
                            <button
                              onClick={() => handleRejectRequest(request.id)}
                              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-white font-semibold text-sm"
                            >
                              ✕ {t('friends.decline')}
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )
                ) : loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
                  </div>
                ) : filteredFriends.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <p className="text-4xl mb-2">😔</p>
                    <p>Nenhum amigo {activeTab === 'online' ? 'online' : 'encontrado'}</p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {filteredFriends.map((friend) => (
                      <motion.div
                        key={friend.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedFriend(friend)}
                        className={`p-4 border-b border-slate-700/50 cursor-pointer transition-colors ${
                          selectedFriend?.id === friend.id
                            ? 'bg-purple-600/20 border-l-4 border-l-purple-500'
                            : 'hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <img
                              src={getProfileImageUrl(friend.profileImage)}
                              alt={friend.nickname}
                              className="w-12 h-12 rounded-full border-2 border-purple-500 object-cover"
                              onError={(e) => {
                                e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                              }}
                            />
                            {friend.isOnline && (
                              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-800"></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white truncate">
                              <Link to={`/profile/${friend.id}`} className="hover:text-purple-400 transition-colors cursor-pointer">
                                {friend.clanTag ? `|${friend.clanTag}| ${friend.nickname}` : friend.nickname}
                              </Link>
                            </p>
                            <p className="text-sm text-gray-400 truncate">{friend.nickname}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>{t('profileCard.level')} {friend.level || 1}</span>
                              <span>•</span>
                              <span>Score: {formatScore(friend.totalScore)}</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </div>
          </motion.div>

          {/* Chat ou Solicitações */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-2"
          >
            {activeTab === 'requests' ? (
              <div className="rounded-xl border border-purple-500/30 h-[600px] flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <p className="text-6xl mb-4">🔔</p>
                  <p className="text-xl">{t('friends.manageRequests')}</p>
                  <p className="text-sm mt-2">{t('friends.selectFriend')}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-purple-500/30 h-[600px] flex flex-col">
                {selectedFriend ? (
                <>
                  {/* Header do Chat */}
                  <div className="p-4 border-b border-slate-700 flex items-center gap-3">
                    <div className="relative">
                      <img
                        src={getProfileImageUrl(selectedFriend.profileImage)}
                        alt={selectedFriend.nickname}
                        className="w-12 h-12 rounded-full border-2 border-purple-500 object-cover"
                        onError={(e) => {
                          e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                        }}
                      />
                      {selectedFriend.isOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-800"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-white">
                        <Link to={`/profile/${selectedFriend.id}`} className="hover:text-purple-400 transition-colors cursor-pointer">
                          {selectedFriend.clanTag ? `|${selectedFriend.clanTag}| ${selectedFriend.nickname}` : selectedFriend.nickname}
                        </Link>
                      </h3>
                      <p className="text-sm text-gray-400">
                        {selectedFriend.isOnline ? `🟢 ${t('friends.online')}` : '⚫ Offline'}
                      </p>
                    </div>
                    <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white font-semibold">
                      🎮 Convidar para Duelo
                    </button>
                  </div>

                  {/* Mensagens */}
                  <div 
                    id="messages-container"
                    className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900"
                  >
                    {currentConversation?.messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-gray-400">
                        <div className="text-center">
                          <p className="text-4xl mb-2">💬</p>
                          <p>{t('friends.noMessages')}</p>
                          <p className="text-sm mt-1">{t('friends.startChat')}</p>
                        </div>
                      </div>
                    ) : (
                      // Remover duplicatas antes de renderizar
                      Array.from(new Map(currentConversation?.messages.map(msg => [msg.id, msg])).values()).map((message) => {
                        const isMyMessage = message.senderId === (typeof user?.id === 'string' ? user.id : user?.id?.toString());
                        return (
                          <motion.div
                            key={message.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                                isMyMessage
                                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                                  : 'bg-slate-700/50 border border-white/20 text-white'
                              }`}
                            >
                              <p className="break-words">{message.content}</p>
                              <p className={`text-xs mt-1 ${isMyMessage ? 'text-purple-200' : 'text-gray-400'}`}>
                                {new Date(message.createdAt).toLocaleTimeString('pt-BR', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>

                  {/* Input de Mensagem */}
                  <div className="p-4 border-t border-slate-700 bg-gray-900">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder={t('chat.placeholder')}
                        className="flex-1 bg-gray-800 px-4 py-3 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!messageInput.trim()}
                        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition-all"
                      >
                        📤 {t('friends.send')}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <p className="text-6xl mb-4">💬</p>
                    <p className="text-xl">{t('friends.selectFriend')}</p>
                  </div>
                </div>
              )}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
