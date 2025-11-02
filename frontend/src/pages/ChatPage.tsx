import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { useSocketStore } from '../stores/socketStore';

interface Message {
  id: string;
  username: string;
  content: string;
  timestamp: Date;
}

export default function ChatPage() {
  const { user } = useAuthStore();
  const { connect, emit, on, isConnected } = useSocketStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [currentChannel] = useState('global');

  useEffect(() => {
    const token = useAuthStore.getState().token;
    if (token) {
      connect(token);
    }

    // Entrar no canal global
    emit('joinChannel', { channel: 'global' });

    // Escutar novas mensagens
    on('newMessage', (data: Message) => {
      setMessages((prev) => [...prev, data]);
    });

    return () => {
      emit('leaveChannel', { channel: 'global' });
    };
  }, []);

  const handleSendMessage = () => {
    if (!messageInput.trim() || !user) return;

    emit('sendMessage', {
      channel: currentChannel,
      userId: user.id,
      username: user.username,
      content: messageInput,
    });

    setMessageInput('');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800 rounded-lg shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            💬 Chat Global
            {isConnected ? (
              <span className="text-green-400 text-sm">(● Conectado)</span>
            ) : (
              <span className="text-red-400 text-sm">(○ Desconectado)</span>
            )}
          </h1>
        </div>

        {/* Mensagens */}
        <div className="h-[500px] overflow-y-auto p-4 bg-gray-900">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 py-16">
              <p className="text-4xl mb-4">💭</p>
              <p>Nenhuma mensagem ainda. Seja o primeiro a falar!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`p-3 rounded-lg ${
                    msg.username === user?.username
                      ? 'bg-blue-900 ml-auto max-w-[80%]'
                      : 'bg-gray-800 mr-auto max-w-[80%]'
                  }`}
                >
                  <p className="text-sm text-gray-400 mb-1">
                    {msg.username}
                  </p>
                  <p className="text-white">{msg.content}</p>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Input de Mensagem */}
        <div className="p-4 bg-gray-800 border-t border-gray-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Digite sua mensagem..."
              className="flex-1 bg-gray-900 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!isConnected}
            />
            <button
              onClick={handleSendMessage}
              disabled={!isConnected || !messageInput.trim()}
              className="btn-primary px-6"
            >
              Enviar
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
