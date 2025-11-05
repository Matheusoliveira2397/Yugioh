import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';

interface Friend {
  id: string;
  username: string;
  nickname: string;
  profileImage: string;
  isOnline: boolean;
  level: number;
  rating: number;
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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function FriendsPage() {
  const { user, token } = useAuthStore();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [conversations, setConversations] = useState<Map<string, Conversation>>(new Map());
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'online' | 'all'>('online');

  // Buscar lista de amigos
  useEffect(() => {
    const fetchFriends = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_URL}/friends`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFriends(response.data);
      } catch (error) {
        console.error('Erro ao carregar amigos:', error);
        // Dados mockados para demonstração
        setFriends([
          {
            id: '1',
            username: 'Kaiba',
            nickname: 'Seto Kaiba',
            profileImage: '/avatars/kaiba.png',
            isOnline: true,
            level: 45,
            rating: 2500
          },
          {
            id: '2',
            username: 'Joey',
            nickname: 'Joey Wheeler',
            profileImage: '/avatars/joey.png',
            isOnline: true,
            level: 38,
            rating: 2100
          },
          {
            id: '3',
            username: 'Yugi',
            nickname: 'Yugi Muto',
            profileImage: '/avatars/yugi.png',
            isOnline: false,
            level: 50,
            rating: 3000
          },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchFriends();
  }, [token]);

  // Buscar mensagens quando seleciona um amigo
  useEffect(() => {
    if (selectedFriend) {
      fetchMessages(selectedFriend.id);
    }
  }, [selectedFriend]);

  const fetchMessages = async (friendId: string) => {
    try {
      const response = await axios.get(`${API_URL}/messages/${friendId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const conversation: Conversation = {
        friend: selectedFriend!,
        messages: response.data,
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
    if (!messageInput.trim() || !selectedFriend) return;

    try {
      const response = await axios.post(
        `${API_URL}/messages`,
        {
          receiverId: selectedFriend.id,
          content: messageInput
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const newMessage: Message = response.data;
      
      setConversations(prev => {
        const newMap = new Map(prev);
        const conversation = newMap.get(selectedFriend.id);
        if (conversation) {
          conversation.messages.push(newMessage);
        }
        return newMap;
      });

      setMessageInput('');
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      // Mock: adicionar mensagem localmente
      if (!user) return;
      
      const newMessage: Message = {
        id: Date.now().toString(),
        senderId: user.id,
        receiverId: selectedFriend.id,
        content: messageInput,
        createdAt: new Date().toISOString(),
        read: false
      };

      setConversations(prev => {
        const newMap = new Map(prev);
        const conversation = newMap.get(selectedFriend.id);
        if (conversation) {
          conversation.messages.push(newMessage);
        }
        return newMap;
      });

      setMessageInput('');
    }
  };

  const filteredFriends = friends.filter(friend => 
    activeTab === 'online' ? friend.isOnline : true
  );

  const currentConversation = selectedFriend ? conversations.get(selectedFriend.id) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">
            👥 Amigos
          </h1>
          <p className="text-gray-300">Conecte-se com seus amigos e converse!</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de Amigos */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-1"
          >
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-purple-500/30 overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-slate-700">
                <button
                  onClick={() => setActiveTab('online')}
                  className={`flex-1 py-3 px-4 font-semibold transition-colors ${
                    activeTab === 'online'
                      ? 'bg-green-600/20 text-green-400 border-b-2 border-green-400'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🟢 Online ({friends.filter(f => f.isOnline).length})
                </button>
                <button
                  onClick={() => setActiveTab('all')}
                  className={`flex-1 py-3 px-4 font-semibold transition-colors ${
                    activeTab === 'all'
                      ? 'bg-purple-600/20 text-purple-400 border-b-2 border-purple-400'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  📋 Todos ({friends.length})
                </button>
              </div>

              {/* Lista */}
              <div className="max-h-[600px] overflow-y-auto">
                {loading ? (
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
                            : 'hover:bg-slate-700/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <img
                              src={friend.profileImage || '/default-avatar.png'}
                              alt={friend.username}
                              className="w-12 h-12 rounded-full border-2 border-purple-500"
                            />
                            {friend.isOnline && (
                              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-800"></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white truncate">{friend.nickname}</p>
                            <p className="text-sm text-gray-400 truncate">@{friend.username}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>Nível {friend.level}</span>
                              <span>•</span>
                              <span>{friend.rating} ⭐</span>
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

          {/* Chat */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-2"
          >
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-purple-500/30 h-[600px] flex flex-col">
              {selectedFriend ? (
                <>
                  {/* Header do Chat */}
                  <div className="p-4 border-b border-slate-700 flex items-center gap-3">
                    <div className="relative">
                      <img
                        src={selectedFriend.profileImage || '/default-avatar.png'}
                        alt={selectedFriend.username}
                        className="w-12 h-12 rounded-full border-2 border-purple-500"
                      />
                      {selectedFriend.isOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-800"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-white">{selectedFriend.nickname}</h3>
                      <p className="text-sm text-gray-400">
                        {selectedFriend.isOnline ? '🟢 Online' : '⚫ Offline'}
                      </p>
                    </div>
                    <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white font-semibold">
                      🎮 Convidar para Duelo
                    </button>
                  </div>

                  {/* Mensagens */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {currentConversation?.messages.map((message) => {
                      const isMyMessage = message.senderId === user?.id;
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
                                : 'bg-slate-700 text-white'
                            }`}
                          >
                            <p>{message.content}</p>
                            <p className={`text-xs mt-1 ${isMyMessage ? 'text-purple-200' : 'text-gray-400'}`}>
                              {new Date(message.createdAt).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Input de Mensagem */}
                  <div className="p-4 border-t border-slate-700">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="Digite sua mensagem..."
                        className="flex-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!messageInput.trim()}
                        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition-all"
                      >
                        📤 Enviar
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <p className="text-6xl mb-4">💬</p>
                    <p className="text-xl">Selecione um amigo para começar a conversar</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
