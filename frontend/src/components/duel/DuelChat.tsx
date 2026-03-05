import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface ChatMessage {
  username: string;
  message: string;
  timestamp: Date;
}

interface DuelChatProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
}

const DuelChat: React.FC<DuelChatProps> = ({ messages, onSendMessage }) => {
  const [inputMessage, setInputMessage] = useState('');
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim()) {
      onSendMessage(inputMessage);
      setInputMessage('');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-transparent backdrop-blur-sm rounded-xl border border-slate-700/30 shadow-lg overflow-hidden flex flex-col"
      style={{ height: '400px' }}
    >
      {/* Header */}
      <div className="bg-slate-900/20 backdrop-blur-sm px-4 py-3 border-b border-slate-700/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <h3 className="text-sm font-bold text-white tracking-wide">Chat do Duelo</h3>
          {messages.length > 0 && (
            <span className="bg-blue-500/20 text-blue-300 text-[10px] px-2 py-0.5 rounded-full font-semibold">
              {messages.length}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">
            {/* Mensagens */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto space-y-2 p-3 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  <p>Nenhuma mensagem ainda</p>
                  <p className="text-[10px] mt-1">Comece a conversar!</p>
                </div>
              ) : (
                messages.map((msg, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="bg-slate-800/20 backdrop-blur-sm rounded-lg border-l-4 border-blue-500/30 pl-3 pr-2 py-2 hover:bg-slate-800/30 transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-bold text-xs">{msg.username}</span>
                      <span className="text-slate-400 text-[10px]">
                        {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                    </div>
                    <div className="text-slate-200 text-xs leading-relaxed break-words">
                      {msg.message}
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* Input */}
            <div className="border-t border-slate-700/30 p-3 bg-slate-900/20 backdrop-blur-sm">
              <form onSubmit={handleSend} className="flex gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Digite uma mensagem..."
                  className="flex-1 bg-slate-700/50 text-white placeholder-slate-400 px-3 py-2 rounded-lg border border-slate-600/50 focus:border-blue-500/50 focus:bg-slate-700/70 outline-none text-xs transition-all focus:ring-2 focus:ring-blue-500/20"
                  maxLength={200}
                />
                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  disabled={!inputMessage.trim()}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-semibold text-xs transition-all border border-blue-500/50 text-white shadow-lg"
                >
                  Enviar
                </motion.button>
              </form>
              <p className="text-[10px] text-slate-500 mt-1 text-right">
                {inputMessage.length}/200
              </p>
            </div>
      </div>
    </motion.div>
  );
};

export default DuelChat;
