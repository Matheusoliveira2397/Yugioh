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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/80 rounded-xl border-2 border-purple-500/40 shadow-lg shadow-purple-500/10 p-3 h-[320px] flex flex-col">
      <h3 className="text-sm font-bold text-purple-400 mb-2 pb-2 border-b border-purple-500/30 tracking-wide">
        CHAT DO DUELO
      </h3>
      
      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 scrollbar-thin scrollbar-thumb-purple-500 scrollbar-track-slate-800">
        {messages.map((msg, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-slate-800/50 rounded border border-slate-700/50 p-2"
          >
            <div className="text-purple-300 font-bold text-xs">{msg.username}</div>
            <div className="text-slate-200 text-xs mt-0.5">{msg.message}</div>
            <div className="text-slate-500 text-[10px] mt-1">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </div>
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Mensagem..."
          className="flex-1 bg-slate-900/80 text-white px-3 py-1.5 rounded border border-slate-700 focus:border-purple-500 outline-none text-xs"
          maxLength={200}
        />
        <button
          type="submit"
          className="bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-1.5 rounded font-bold text-xs hover:from-purple-500 hover:to-pink-500 transition-all border border-purple-400/30"
        >
          Enviar
        </button>
      </form>
    </div>
  );
};

export default DuelChat;
