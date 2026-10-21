import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSocketStore } from '../stores/socketStore';
import { getSocialIcon } from '../components/SocialMediaIcons';
import axios from 'axios';
import { getImageUrl, getProfileImageUrl, DEFAULT_PROFILE_IMAGE_PATH } from '../utils/imageUrl';
import { requestActiveDuelRefresh } from '../utils/activeDuelRefresh';
import { useI18n } from '../i18n/I18nContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Message {
  id: string;
  userId: string;
  username: string;
  clanTag?: string;
  profileImage?: string | null;
  content: string;
  timestamp: Date | string;
  createdAt?: Date | string;
  isChallenge?: boolean; // Indica se é uma mensagem de desafio
}

interface OnlineUser {
  userId: number;
  username: string;
  clanTag?: string;
  profileImage?: string | null;
  level?: number;
}

interface PrivateChat {
  userId: string;
  username: string;
  clanTag?: string;
  messages: Message[];
  level?: number;
}

export default function ChatPage() {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { connect, emit, on, isConnected, getSocket } = useSocketStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  // Aba selecionada: 'global' | 'clan' | userId (chat privado = uma aba por conversa)
  const [selectedTab, setSelectedTab] = useState<'global' | 'clan' | string>('global');
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  // Canal normalizado (clan em minúsculo) para bater com o backend e persistência
  const currentChannel = selectedTab === 'global'
    ? 'global'
    : selectedTab === 'clan' && user?.clanTag
      ? `clan:${String(user.clanTag).trim().toLowerCase()}`
      : 'global';
  const [privateChats, setPrivateChats] = useState<Map<string, PrivateChat>>(new Map());
  const isPrivateTab = selectedTab !== 'global' && selectedTab !== 'clan';
  const activePrivateChat = isPrivateTab ? selectedTab : null;
  const [privateMessageInput, setPrivateMessageInput] = useState<Map<string, string>>(new Map());
  const [pendingChallenges, setPendingChallenges] = useState<Map<string, {
    challengerId: string;
    challengerUsername: string;
    challengerClanTag?: string;
  }>>(new Map());
  const [mentionNotification, setMentionNotification] = useState<{
    fromUsername: string;
    fromClanTag?: string;
    contentPreview: string;
  } | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-esconder toast de menção após 5s
  useEffect(() => {
    if (!mentionNotification) return;
    const t = setTimeout(() => setMentionNotification(null), 5000);
    return () => clearTimeout(t);
  }, [mentionNotification]);

  // Sempre mostrar as mensagens mais recentes: rolar para o final ao entrar e ao receber novas mensagens
  useEffect(() => {
    if (messages.length === 0) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    const scrollToBottom = () => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    };
    const t = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(t);
  }, [messages]);

  const handleOpenPrivateChat = (targetUserId: string, targetUsername: string, targetClanTag?: string, targetLevel?: number) => {
    // Não permitir abrir chat privado com você mesmo
    const currentUserId = user?.id ? (typeof user.id === 'string' ? user.id : user.id.toString()) : null;
    if (targetUserId === currentUserId) {
      return;
    }

    setSelectedTab(targetUserId);
    setPrivateChats((prev) => {
      const newChats = new Map(prev);
      if (newChats.has(targetUserId) && targetLevel !== undefined) {
        const existing = newChats.get(targetUserId)!;
        newChats.set(targetUserId, { ...existing, level: targetLevel });
      } else if (!newChats.has(targetUserId)) {
        newChats.set(targetUserId, {
          userId: targetUserId,
          username: targetUsername,
          clanTag: targetClanTag,
          messages: [],
          level: targetLevel,
        });
      }
      return newChats;
    });
    if (!privateMessageInput.has(targetUserId)) {
      setPrivateMessageInput((prev) => {
        const newMap = new Map(prev);
        newMap.set(targetUserId, '');
        return newMap;
      });
    }
  };

  useEffect(() => {
    const token = useAuthStore.getState().token;
    if (token && user) {
      connect(token);
    }

    const socket = getSocket();
    if (!socket) return;

    // Canal a entrar: global ou clan (só quando a aba selecionada for global/clan; em aba privada não muda canal)
    const channelToJoin = selectedTab === 'global' ? 'global' : (selectedTab === 'clan' && user?.clanTag ? `clan:${user.clanTag}` : null);

    const setupChat = () => {
      if (!socket.connected || !user) {
        console.log('⚠️ [ChatPage] setupChat: Socket não conectado ou usuário não disponível', {
          socketConnected: socket?.connected,
          hasUser: !!user,
        });
        return;
      }

      console.log('✅ [ChatPage] Configurando chat - socket conectado:', socket.id);

      setMessages([]);
      socket.emit('leaveChannel', { channel: 'global' });
      if (user.clanTag) socket.emit('leaveChannel', { channel: `clan:${user.clanTag}` });

      if (channelToJoin) {
        console.log('📤 [ChatPage] Enviando joinChannel:', { channel: channelToJoin, userId: user.id });
        socket.emit('joinChannel', {
          channel: channelToJoin,
          userId: user.id,
          username: user.username,
          nickname: user.nickname || user.username,
          clanTag: user.clanTag,
        });
      }

      // Escutar mensagens carregadas do banco
      socket.on('messagesLoaded', (data: { messages: Message[] }) => {
        console.log(`📋 [ChatPage] Mensagens antigas carregadas: ${data.messages.length} mensagens`);
        // Manter apenas as últimas 50 mensagens
        const limitedMessages = data.messages.slice(-50);
        setMessages(limitedMessages);
      });

      // Escutar novas mensagens
      socket.on('newMessage', (data: Message) => {
        console.log('📥 [ChatPage] Nova mensagem recebida:', {
          id: data.id,
          userId: data.userId,
          username: data.username,
          content: data.content.substring(0, 50),
        });
        setMessages((prev) => {
          // Evitar duplicatas
          if (prev.some(m => m.id === data.id)) {
            console.log('⚠️ [ChatPage] Mensagem duplicada ignorada:', data.id);
            return prev;
          }
          // Manter apenas as últimas 50 mensagens
          const newMessages = [...prev, data].slice(-50);
          console.log(`✅ [ChatPage] Mensagem adicionada. Total: ${newMessages.length}`);
          return newMessages;
        });
      });

      // Escutar usuários online
      socket.on('onlineUsers', (data: { users: OnlineUser[] }) => {
        setOnlineUsers(data.users || []);
      });

      // Escutar quando usuário entra
      socket.on('userJoined', (data: { userId: number; username: string; clanTag?: string; profileImage?: string | null }) => {
        setOnlineUsers((prev) => {
          if (prev.some(u => u.userId === data.userId)) {
            return prev;
          }
          return [...prev, { userId: data.userId, username: data.username, clanTag: data.clanTag, profileImage: data.profileImage }];
        });
      });

      // Escutar quando usuário sai
      socket.on('userLeft', (data: { userId: number }) => {
        setOnlineUsers((prev) => prev.filter(u => u.userId !== data.userId));
      });

      // Escutar mensagens privadas
      // Mensagens privadas do chat global (não aparecem no ícone de mensagens; ícone = só amigos)
      socket.on('chatPrivateMessage', (data: Message) => {
        const senderId = String(data.userId ?? '');
        const currentUserId = user?.id ? String(user.id) : null;
        if (senderId === currentUserId) return;
        setPrivateChats((prev) => {
          const newChats = new Map(prev);
          const chat = newChats.get(senderId) || {
            userId: senderId,
            username: data.username ?? '',
            clanTag: data.clanTag,
            messages: [],
          };
          const now = new Date();
          const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const allMessages = [...chat.messages, data];
          const filteredMessages = allMessages
            .filter(msg => {
              const msgDate = new Date(msg.timestamp || (msg as any).createdAt || now);
              return msgDate >= twentyFourHoursAgo;
            })
            .slice(-20);
          chat.messages = filteredMessages;
          newChats.set(senderId, chat);
          return newChats;
        });
        setSelectedTab(senderId);
      });

      // Escutar comando Master: chat global limpo (só limpa se estiver no global)
      socket.on('chatCleared', () => {
        if (selectedTab === 'global') setMessages([]);
      });

      // Escutar quando alguém te menciona no chat (@nick)
      socket.on('mention', (data: { fromUsername: string; fromClanTag?: string; contentPreview: string }) => {
        setMentionNotification({
          fromUsername: data.fromUsername,
          fromClanTag: data.fromClanTag,
          contentPreview: data.contentPreview,
        });
      });

      // Escutar desafios de duelo
      socket.on('duelChallenge', (data: { challengerId: string; challengerUsername?: string; challengerClanTag?: string }) => {
        const challengerName = data.challengerUsername || onlineUsers.find(u => u.userId.toString() === data.challengerId)?.username || 'Alguém';
        const challengerClanTag = data.challengerClanTag || onlineUsers.find(u => u.userId.toString() === data.challengerId)?.clanTag;
        
        // Abrir chat privado com o desafiante se não estiver aberto
        const currentUserId = user?.id ? (typeof user.id === 'string' ? user.id : user.id.toString()) : null;
        if (data.challengerId !== currentUserId) {
          setSelectedTab(data.challengerId);
          
          // Adicionar desafio pendente
          setPendingChallenges((prev) => {
            const newMap = new Map(prev);
            newMap.set(data.challengerId, {
              challengerId: data.challengerId,
              challengerUsername: challengerName,
              challengerClanTag: challengerClanTag,
            });
            return newMap;
          });
          
          setPrivateChats((prev) => {
            const newChats = new Map(prev);
            const chat = newChats.get(data.challengerId) || {
              userId: data.challengerId,
              username: challengerName,
              clanTag: challengerClanTag,
              messages: [],
            };
            
            // Verificar se já existe uma mensagem de desafio recente (evitar duplicatas)
            const hasRecentChallenge = chat.messages.some(m => 
              m.isChallenge && 
              m.userId === data.challengerId &&
              Date.now() - new Date(m.timestamp).getTime() < 2000 // Últimos 2 segundos
            );
            
            if (!hasRecentChallenge) {
              // Buscar profileImage do desafiante
              const challengerUser = onlineUsers.find(u => u.userId.toString() === data.challengerId);
              chat.messages = [...chat.messages, {
                id: `challenge-${Date.now()}`,
                userId: data.challengerId,
                username: challengerName,
                clanTag: challengerClanTag,
                profileImage: challengerUser?.profileImage || null, // Incluir profileImage
                content: `⚔️ ${challengerClanTag ? `|${challengerClanTag}| ` : ''}${challengerName} te desafiou para um duelo!`,
                timestamp: new Date(),
                createdAt: new Date(),
                isChallenge: true, // Marcar como desafio
              }];
              newChats.set(data.challengerId, chat);
            }
            return newChats;
          });
          if (!privateMessageInput.has(data.challengerId)) {
            setPrivateMessageInput((prev) => {
              const newMap = new Map(prev);
              newMap.set(data.challengerId, '');
              return newMap;
            });
          }
        }
      });
    };

    if (socket.connected) {
      setupChat();
    } else {
      socket.on('connect', setupChat);
    }

    return () => {
      if (socket) {
        socket.off('newMessage');
        socket.off('messagesLoaded');
        socket.off('onlineUsers');
        socket.off('userJoined');
        socket.off('userLeft');
        socket.off('chatPrivateMessage');
        socket.off('duelChallenge');
        socket.off('chatCleared');
        socket.off('mention');
        socket.emit('leaveChannel', { channel: 'global' });
        if (user?.clanTag) socket.emit('leaveChannel', { channel: `clan:${user.clanTag}` });
      }
    };
  }, [user, user?.clanTag, selectedTab, getSocket, connect]);

  // Ctrl+L: Master limpa o chat global
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
        if (user?.role !== 'MASTER') return;
        e.preventDefault();
        const socket = getSocket();
        if (socket?.connected) {
          socket.emit('clearGlobalChat');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user?.role, getSocket]);

  const handleSendMessage = () => {
    if (!messageInput.trim() || !user) return;

    const socket = getSocket();
    if (!socket || !socket.connected) {
      alert('Não conectado ao servidor. Aguarde...');
      return;
    }

    console.log('📤 [ChatPage] Enviando mensagem:', {
      channel: currentChannel,
      userId: user.id,
      username: user.username,
      content: messageInput.trim().substring(0, 50),
      socketId: socket.id,
      socketConnected: socket.connected,
    });

    socket.emit('sendMessage', {
      channel: currentChannel,
      userId: user.id,
      username: user.username,
      nickname: user.nickname || user.username,
      clanTag: user.clanTag,
      content: messageInput.trim(),
    });

    setMessageInput('');
  };


  const handleSendPrivateMessage = (targetUserId: string) => {
    const input = privateMessageInput.get(targetUserId) || '';
    if (!input.trim() || !user) return;

    const socket = getSocket();
    if (!socket || !socket.connected) {
      alert('Não conectado ao servidor. Aguarde...');
      return;
    }

    const content = input.trim();
    socket.emit('sendPrivateMessage', {
      userId: user.id.toString(),
      username: user.nickname || user.username,
      recipientId: targetUserId,
      content,
    });

    setPrivateMessageInput((prev) => {
      const newMap = new Map(prev);
      newMap.set(targetUserId, '');
      return newMap;
    });

    setPrivateChats((prev) => {
      const newChats = new Map(prev);
      const chat = newChats.get(targetUserId) || { userId: targetUserId, username: '', clanTag: undefined, messages: [] };
      chat.messages = [...chat.messages, {
        id: `sent-${Date.now()}`,
        userId: user.id.toString(),
        username: user.nickname || user.username || '',
        clanTag: user.clanTag,
        profileImage: user.profileImage ?? null,
        content,
        timestamp: new Date(),
        createdAt: new Date(),
      }];
      newChats.set(targetUserId, chat);
      return newChats;
    });
  };

  const handleChallengePlayer = (targetUserId: string, targetUsername: string, targetClanTag?: string) => {
    if (!user) return;

    // Verificar se não está tentando desafiar a si mesmo
    const currentUserId = user.id ? (typeof user.id === 'string' ? user.id : user.id.toString()) : null;
    if (targetUserId === currentUserId) {
      alert('Você não pode desafiar a si mesmo!');
      return;
    }

    const socket = getSocket();
    if (!socket || !socket.connected) {
      alert('Não conectado ao servidor. Aguarde...');
      return;
    }

    // Enviar desafio via WebSocket (sem confirmação)
    socket.emit('challengePlayer', {
      challengerId: user.id.toString(),
      challengedId: targetUserId,
    });

    // Abrir chat privado se não estiver aberto
    if (activePrivateChat !== targetUserId) {
      handleOpenPrivateChat(targetUserId, targetUsername, targetClanTag);
    }

    // Adicionar mensagem localmente ao chat privado (apenas uma vez)
    const challengeMessage = `⚔️ Desafio de duelo enviado! Aguardando resposta...`;
    const messageId = `challenge-sent-${Date.now()}`;
    setPrivateChats((prev) => {
      const newChats = new Map(prev);
      const chat = newChats.get(targetUserId) || {
        userId: targetUserId,
        username: targetUsername,
        clanTag: targetClanTag,
        messages: [],
      };
      
      // Verificar se já existe uma mensagem de desafio recente (evitar duplicatas)
      const hasRecentChallenge = chat.messages.some(m => 
        m.content.includes('Desafio de duelo') && 
        Date.now() - new Date(m.timestamp).getTime() < 2000 // Últimos 2 segundos
      );
      
      if (!hasRecentChallenge) {
        chat.messages = [...chat.messages, {
          id: messageId,
          userId: user.id.toString(),
          username: user.nickname || user.username,
          clanTag: user.clanTag,
          profileImage: user.profileImage || null, // Incluir profileImage
          content: challengeMessage,
          timestamp: new Date(),
          createdAt: new Date(),
        }];
        newChats.set(targetUserId, chat);
      }
      return newChats;
    });
  };

  const handleAcceptChallenge = async (challengerId: string) => {
    if (!user) return;

    const socket = getSocket();
    if (!socket || !socket.connected) {
      alert('Não conectado ao servidor. Aguarde...');
      return;
    }

    const challengerIdNum = parseInt(challengerId);
    const challengedId = typeof user.id === 'string' ? parseInt(user.id) : user.id;

    // Remover desafio pendente
    setPendingChallenges((prev) => {
      const newMap = new Map(prev);
      newMap.delete(challengerId);
      return newMap;
    });

    // Adicionar mensagem de aceitação no chat
    setPrivateChats((prev) => {
      const newChats = new Map(prev);
      const chat = newChats.get(challengerId);
      if (chat) {
        chat.messages = [...chat.messages, {
          id: Date.now().toString(),
          userId: user.id.toString(),
          username: user.nickname || user.username,
          clanTag: user.clanTag,
          profileImage: user.profileImage || null, // Incluir profileImage
          content: '✅ Desafio aceito! Criando duelo...',
          timestamp: new Date(),
          createdAt: new Date(),
        }];
        newChats.set(challengerId, chat);
      }
      return newChats;
    });

    // Escutar resposta do servidor
    const handleDuelCreated = (data: any) => {
      socket.off('duelCreated', handleDuelCreated);
      socket.off('duelError', handleDuelError);
      const duelId = data?.duelId || data?.duel?.id || data?.id;
      if (duelId) {
        requestActiveDuelRefresh();
        navigate(`/duel/${duelId}`);
      } else {
        alert('Erro: ID do duelo não recebido');
      }
    };

    const handleDuelError = (error: { message: string }) => {
      socket.off('duelCreated', handleDuelCreated);
      socket.off('duelError', handleDuelError);
      alert(error.message || 'Erro ao criar duelo. Verifique se ambos têm deck equipado.');
      
      // Adicionar mensagem de erro no chat
      setPrivateChats((prev) => {
        const newChats = new Map(prev);
        const chat = newChats.get(challengerId);
        if (chat) {
          chat.messages = [...chat.messages, {
            id: Date.now().toString(),
            userId: 'system',
            username: 'Sistema',
            profileImage: null, // Sistema não tem imagem
            content: `❌ ${error.message || 'Erro ao criar duelo'}`,
            timestamp: new Date(),
            createdAt: new Date(),
          }];
          newChats.set(challengerId, chat);
        }
        return newChats;
      });
    };

    socket.once('duelCreated', handleDuelCreated);
    socket.once('duelError', handleDuelError);

    // Enviar requisição para criar duelo
    socket.emit('createDuelFromMatch', {
      player1Id: challengerIdNum,
      player2Id: challengedId,
      origin: 'CHAT',
    });
  };

  const handleRejectChallenge = (challengerId: string) => {
    // Remover desafio pendente
    setPendingChallenges((prev) => {
      const newMap = new Map(prev);
      newMap.delete(challengerId);
      return newMap;
    });

    // Adicionar mensagem de recusa no chat
    if (user) {
      setPrivateChats((prev) => {
        const newChats = new Map(prev);
        const chat = newChats.get(challengerId);
        if (chat) {
          chat.messages = [...chat.messages, {
            id: Date.now().toString(),
            userId: user.id.toString(),
            username: user.nickname || user.username,
            clanTag: user.clanTag,
            profileImage: user.profileImage || null, // Incluir profileImage
            content: '❌ Desafio recusado',
            timestamp: new Date(),
            createdAt: new Date(),
          }];
          newChats.set(challengerId, chat);
        }
        return newChats;
      });
    }
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-2 sm:px-4 py-4 sm:py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-7xl rounded-xl overflow-hidden flex flex-col border border-white/20 shadow-2xl"
        style={{ height: 'calc(100vh - 8rem)', maxHeight: '900px' }}
      >
          {/* Header: abas Global / Chat do clã + Online */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-3 sm:p-4 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedTab('global')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${selectedTab === 'global' ? 'bg-white/20 text-white ring-2 ring-white/50' : 'text-white/80 hover:bg-white/10'}`}
                >
                  💬 {t('chat.global')}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTab('clan')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${selectedTab === 'clan' ? 'bg-white/20 text-white ring-2 ring-white/50' : 'text-white/80 hover:bg-white/10'}`}
                >
                  🏴 {user?.clanTag ? `|${user.clanTag}|` : t('chat.clan')}
                </button>
                {Array.from(privateChats.entries()).map(([userId, chat]) => (
                  <div
                    key={userId}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                      selectedTab === userId ? 'bg-purple-600/80 text-white ring-2 ring-purple-400' : 'text-white/80 hover:bg-white/10 bg-white/5'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedTab(userId)}
                      className="truncate max-w-[120px]"
                    >
                      💬 {chat.clanTag ? `|${chat.clanTag}| ` : ''}{chat.username}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrivateChats((prev) => {
                          const next = new Map(prev);
                          next.delete(userId);
                          return next;
                        });
                        setPrivateMessageInput((prev) => {
                          const next = new Map(prev);
                          next.delete(userId);
                          return next;
                        });
                        setSelectedTab(selectedTab === userId ? 'global' : selectedTab);
                      }}
                      className="text-white/70 hover:text-white ml-0.5"
                      title={t('chat.closeTab')}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <span className="text-green-400 text-xs sm:text-sm">(● {t('chat.connected')})</span>
                ) : (
                  <span className="text-red-400 text-xs sm:text-sm">(○ {t('chat.disconnected')})</span>
                )}
              </div>
            </div>
            <div className="hidden lg:flex w-80 flex-shrink-0 flex-col items-center justify-center">
              <span className="text-sm sm:text-base font-bold text-white whitespace-nowrap">
                👥 Online ({onlineUsers.length})
              </span>
              <span className="text-xs text-white/70">{t('chat.duelistsInChat')}</span>
            </div>
          </div>

          {/* Container principal com chat e online lado a lado */}
          <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
            {/* Chat Principal */}
            <div className={`relative flex-1 flex flex-col transition-all duration-300 ${activePrivateChat ? 'lg:mr-0' : ''}`}>

              {/* Toast: você foi mencionado */}
              {mentionNotification && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-2 left-2 right-2 z-10 mx-auto max-w-md rounded-lg border border-blue-500/50 bg-blue-900/95 px-4 py-3 shadow-lg backdrop-blur-sm"
                >
                  <p className="text-sm font-semibold text-blue-200">
                    💬 {mentionNotification.fromClanTag ? `|${mentionNotification.fromClanTag}| ` : ''}
                    {mentionNotification.fromUsername} te mencionou no chat
                  </p>
                  <p className="mt-1 truncate text-xs text-gray-300">{mentionNotification.contentPreview}</p>
                  <button
                    type="button"
                    onClick={() => setMentionNotification(null)}
                    className="mt-2 text-xs text-blue-300 hover:text-white underline"
                  >
                    {t('common.close')}
                  </button>
                </motion.div>
              )}

              {/* Conteúdo: canal (global/clan) ou chat privado em aba */}
              {isPrivateTab ? (
                (() => {
                  const chat = privateChats.get(selectedTab);
                  if (!chat) return null;
                  const input = privateMessageInput.get(selectedTab) || '';
                  return (
                    <>
                      <div className="p-3 border-b border-white/20 flex items-center justify-between flex-wrap gap-2">
                        <span className="text-sm font-bold text-purple-200">
                          💬 {chat.clanTag ? `|${chat.clanTag}| ` : ''}{chat.username}
                          {(chat.level ?? 0) > 0 && <span className="text-yellow-300/90 text-xs ml-1">{t('profileCard.level')} {chat.level}</span>}
                        </span>
                        {selectedTab !== (user?.id ? String(user.id) : '') && (
                          <button
                            onClick={() => handleChallengePlayer(selectedTab, chat.username, chat.clanTag)}
                            className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-1.5 px-3 rounded text-xs"
                          >
                            ⚔️ {t('chat.challenge')}
                          </button>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 sm:p-4 custom-scrollbar space-y-2">
                        {chat.messages.length === 0 ? (
                          <div className="text-center text-gray-500 py-8">
                            <p className="text-2xl mb-2">💭</p>
                            <p className="text-sm">{t('chat.noMessages')}</p>
                          </div>
                        ) : (
                          chat.messages.map((msg, idx) => {
                            const currentUserId = user?.id ? String(user.id) : null;
                            const isMyMessage = msg.userId === currentUserId;
                            const timeString = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
                            const isChallenge = msg.isChallenge && !isMyMessage;
                            const challenge = isChallenge ? pendingChallenges.get(selectedTab) : null;
                            return (
                              <div key={idx} className={`flex gap-2 ${isMyMessage ? 'flex-row-reverse' : 'flex-row'} max-w-[85%] ${isMyMessage ? 'ml-auto' : 'mr-auto'}`}>
                                <div className={`p-2 rounded-lg border text-sm ${isMyMessage ? 'border-blue-500/50 bg-blue-900/20' : isChallenge ? 'border-yellow-500/50 bg-yellow-900/20' : 'border-white/20 bg-gray-800'}`}>
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <img src={getProfileImageUrl(msg.profileImage)} alt="" className="w-5 h-5 rounded-full object-cover" onError={(e) => { e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH; }} />
                                    <span className="font-semibold text-gray-300">{msg.clanTag ? `|${msg.clanTag}| ` : ''}{msg.username}</span>
                                    <span className="text-xs text-gray-500">{timeString}</span>
                                  </div>
                                  <p className="text-white">{msg.content}</p>
                                  {isChallenge && challenge && (
                                    <div className="flex gap-2 mt-2">
                                      <button onClick={() => handleAcceptChallenge(challenge.challengerId)} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-1.5 rounded text-xs">✅ {t('chat.accept')}</button>
                                      <button onClick={() => handleRejectChallenge(challenge.challengerId)} className="flex-1 border border-white/20 text-white py-1.5 rounded text-xs">❌ {t('chat.decline')}</button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                      <div className="p-4 border-t border-white/20">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={input}
                            onChange={(e) => {
                              setPrivateMessageInput((prev) => {
                                const next = new Map(prev);
                                next.set(selectedTab, e.target.value);
                                return next;
                              });
                            }}
                            onKeyPress={(e) => e.key === 'Enter' && handleSendPrivateMessage(selectedTab)}
                            placeholder={t('chat.placeholder')}
                            className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-lg border border-white/20 focus:ring-2 focus:ring-purple-500"
                            disabled={!isConnected}
                          />
                          <button onClick={() => handleSendPrivateMessage(selectedTab)} disabled={!isConnected || !input.trim()} className="btn-primary px-6">{t('chat.send')}</button>
                        </div>
                      </div>
                    </>
                  );
                })()
              ) : (
                <>
              {/* Mensagens — scroll (global ou clã) */}
              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4 custom-scrollbar scroll-smooth"
              >
          {selectedTab === 'clan' && !user?.clanTag ? (
            <div className="text-center text-gray-400 py-8 sm:py-16 px-4">
              <p className="text-4xl mb-4">🏴</p>
              <p className="text-base font-medium text-white/90 mb-2">{t('chat.clanChat')}</p>
              <p className="text-sm">{t('chat.joinClanToSee')}</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8 sm:py-16">
              <p className="text-2xl sm:text-4xl mb-2 sm:mb-4">💭</p>
              <p className="text-sm sm:text-base">
                {t('chat.noMessages')}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 sm:space-y-2">
              {messages.map((msg, index) => {
                const currentUserId = user?.id ? (typeof user.id === 'string' ? user.id : user.id.toString()) : null;
                const isMyMessage = msg.userId === currentUserId || msg.username === user?.username;
                const messageDate = msg.timestamp ? new Date(msg.timestamp) : new Date();
                const timeString = messageDate.toLocaleTimeString('pt-BR', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                });
                
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: isMyMessage ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex gap-1 sm:gap-1.5 ${isMyMessage ? 'flex-row-reverse' : 'flex-row'} max-w-[85%] sm:max-w-[80%] ${isMyMessage ? 'ml-auto' : 'mr-auto'}`}
                  >
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      <img
                        src={getProfileImageUrl(msg.profileImage)}
                        alt={msg.username}
                        className="w-8 h-8 rounded-full object-cover border border-gray-600"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                        }}
                      />
                    </div>
                    
                    {/* Mensagem */}
                    <div className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'} flex-1 min-w-0`}>
                      <div className={`p-1.5 sm:p-2 rounded-lg shadow-md ${isMyMessage ? 'border border-blue-500/50' : 'border border-white/20'}`}>
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <button
                            onClick={() => {
                              const currentUserId = user?.id ? (typeof user.id === 'string' ? user.id : user.id.toString()) : null;
                              if (msg.userId !== currentUserId) {
                                handleOpenPrivateChat(msg.userId, msg.username, msg.clanTag);
                              } else {
                                // Não fazer nada se for o próprio usuário
                                return;
                              }
                            }}
                            className={`text-xs sm:text-sm font-semibold transition-colors cursor-pointer hover:underline ${
                              msg.userId === (user?.id ? (typeof user.id === 'string' ? user.id : user.id.toString()) : null)
                                ? 'text-gray-300 hover:text-white'
                                : 'text-blue-400 hover:text-blue-300'
                            }`}
                            title={msg.userId === (user?.id ? (typeof user.id === 'string' ? user.id : user.id.toString()) : null) ? 'Ver perfil' : 'Clique para conversar em particular'}
                          >
                            {msg.clanTag ? `|${msg.clanTag}| ${msg.username}` : msg.username}
                          </button>
                          <span className="text-[10px] sm:text-xs text-gray-500">{timeString}</span>
                        </div>
                        <p className="text-white text-sm">
                          <ChatMessageContent
                            content={msg.content}
                            onlineUsers={onlineUsers}
                            onMentionClick={(userId, username, clanTag) => {
                              const currentUserId = user?.id ? (typeof user.id === 'string' ? user.id : user.id.toString()) : null;
                              if (userId !== currentUserId) handleOpenPrivateChat(userId, username, clanTag);
                            }}
                          />
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

              {/* Input de Mensagem */}
              <div className="p-4 border-t border-white/20">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder={selectedTab === 'clan' && !user?.clanTag ? t('chat.joinClanToSend') : t('chat.placeholder')}
                    className="flex-1 bg-gray-800 text-white placeholder-gray-400 px-4 py-3 rounded-lg border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!isConnected || (selectedTab === 'clan' && !user?.clanTag)}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!isConnected || !messageInput.trim() || (selectedTab === 'clan' && !user?.clanTag)}
                    className="btn-primary px-6"
                  >
                    {t('chat.send')}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  {selectedTab === 'global' && '@nick para mencionar alguém'}
                  {selectedTab === 'global' && user?.role === 'MASTER' && ' · Ctrl+L limpa o chat (Master)'}
                  {selectedTab === 'clan' && user?.clanTag && `Chat visível apenas para membros do clã |${user.clanTag}|`}
                </p>
              </div>
                </>
              )}
            </div>

            {/* Separador vertical */}
            <div className="w-px bg-white/20"></div>

            {/* Lista de Usuários Online */}
            <div className="hidden lg:flex w-80 flex-shrink-0 flex-col border-l border-white/20">
              <div className="flex-1 overflow-y-auto p-2 sm:p-3">
                {onlineUsers.length === 0 ? (
                  <div className="text-center text-gray-500 py-3">
                    <p className="text-xl mb-1">👤</p>
                    <p className="text-xs">{t('chat.noUsersOnline')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {onlineUsers.map((onlineUser) => {
                      const currentUserId = user?.id ? (typeof user.id === 'string' ? user.id : user.id.toString()) : null;
                      const isSelf = onlineUser.userId.toString() === currentUserId;
                      return (
                        <div
                          key={onlineUser.userId}
                          role="button"
                          tabIndex={0}
                          onClick={() => !isSelf && handleOpenPrivateChat(onlineUser.userId.toString(), onlineUser.username, onlineUser.clanTag, onlineUser.level)}
                          onKeyDown={(e) => e.key === 'Enter' && !isSelf && handleOpenPrivateChat(onlineUser.userId.toString(), onlineUser.username, onlineUser.clanTag, onlineUser.level)}
                          className={`flex items-center gap-2 p-2 rounded-lg border border-white/20 transition-colors ${
                            isSelf ? 'opacity-75 cursor-default' : 'hover:bg-white/10 cursor-pointer'
                          }`}
                          title={isSelf ? 'Você' : 'Clique para abrir chat particular'}
                        >
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0"></div>
                          <div className="relative flex-shrink-0">
                            <img
                              src={getProfileImageUrl(onlineUser.profileImage)}
                              alt={onlineUser.username}
                              className="w-10 h-10 rounded-full object-cover border border-gray-600"
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                              }}
                            />
                            {(onlineUser.level ?? 0) > 0 && (
                              <span
                                className="absolute -bottom-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-black/85 text-yellow-400 text-[10px] font-bold border border-yellow-500/60"
                                title="Nível do duelista"
                              >
                                {onlineUser.level}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-medium text-white truncate flex-1 text-left">
                            {onlineUser.clanTag ? `|${onlineUser.clanTag}| ` : ''}
                            {onlineUser.username}
                          </span>
                          {!isSelf && (
                            <Link
                              to={`/profile/${onlineUser.userId}`}
                              className="text-sm text-gray-400 hover:text-white transition-colors flex-shrink-0 p-1"
                              title="Ver perfil"
                              onClick={(e) => e.stopPropagation()}
                            >
                              👤
                            </Link>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Redes Sociais */}
          <SocialMediaLinks />
      </motion.div>

    </div>
  );
}

/** Renderiza conteúdo da mensagem com @nick como menção clicável (abre chat privado se o usuário estiver online). */
function ChatMessageContent({
  content,
  onlineUsers,
  onMentionClick,
}: {
  content: string;
  onlineUsers: OnlineUser[];
  onMentionClick: (userId: string, username: string, clanTag?: string) => void;
}) {
  const parts = content.split(/(@[^\s@]+)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('@') && part.length > 1) {
          const nick = part.slice(1);
          const online = onlineUsers.find(
            (u) => u.username.toLowerCase() === nick.toLowerCase()
          );
          if (online) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onMentionClick(online.userId.toString(), online.username, online.clanTag)}
                className="text-blue-400 hover:text-blue-300 hover:underline font-medium cursor-pointer mx-0.5"
              >
                {part}
              </button>
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// Componente para exibir redes sociais
function SocialMediaLinks() {
  const { t } = useI18n();
  const [socialMedia, setSocialMedia] = useState<Array<{
    id: string;
    platform: string;
    url: string;
    label: string | null;
    icon: string | null;
  }>>([]);

  useEffect(() => {
    const fetchSocialMedia = async () => {
      try {
        const response = await axios.get(`${API_URL}/public/social-media/active`);
        setSocialMedia(response.data);
      } catch (error) {
        console.error('Erro ao buscar redes sociais:', error);
      }
    };
    fetchSocialMedia();
  }, []);

  if (socialMedia.length === 0) return null;

  return (
    <div className="bg-gray-800/50 border-t border-gray-700 p-4">
      <div className="flex flex-wrap items-center justify-center gap-4">
        <span className="text-gray-400 text-sm">{t('chat.followUs')}</span>
        {socialMedia.map((social) => {
          const icon = getSocialIcon(social.platform, "w-5 h-5");
          
          return (
            <a
              key={social.id}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors text-gray-300 hover:text-white"
              title={social.label || social.platform}
            >
              {icon}
              <span className="text-white text-sm">{social.label || social.platform}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
