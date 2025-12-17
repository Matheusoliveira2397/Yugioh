import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function AdminMessagesPanel() {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState<number | null>(null);

  // Proteção: apenas ADMIN ou MASTER
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  const handleSendMessage = async () => {
    if (!message.trim()) {
      setError('Por favor, digite uma mensagem');
      return;
    }

    if (!token) {
      setError('Token de autenticação não encontrado');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);
    setSentCount(null);

    try {
      const response = await axios.post(
        `${API_URL}/admin/messages/broadcast`,
        { content: message },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      setSuccess(true);
      setSentCount(response.data.sentCount || 0);
      setMessage('');
      
      // Limpar mensagem de sucesso após 5 segundos
      setTimeout(() => {
        setSuccess(false);
        setSentCount(null);
      }, 5000);
    } catch (err: any) {
      console.error('Erro ao enviar mensagem:', err);
      setError(
        err.response?.data?.message || 
        err.message || 
        'Erro ao enviar mensagem para todos os usuários'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 relative z-10">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-4">
            <span className="text-6xl">📢</span>
            <div>
              <h1 className="text-5xl font-bold text-white">Mensagens em Massa</h1>
              <p className="text-slate-400 text-lg">
                Envie mensagens para todos os usuários do sistema
              </p>
            </div>
          </div>

          {/* Badge de Admin */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/50 rounded-lg">
            <span className="text-2xl">👑</span>
            <span className="text-yellow-400 font-bold">
              {user.role === 'MASTER' ? 'MASTER' : 'ADMIN'}
            </span>
          </div>
        </motion.div>

        {/* Card de Envio */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-purple-900/50 to-blue-900/50 rounded-xl p-6 border border-purple-500/30 shadow-xl"
        >
          <div className="mb-6">
            <label className="block text-white font-semibold mb-2 text-lg">
              Mensagem
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite a mensagem que será enviada para todos os usuários..."
              className="w-full h-40 px-4 py-3 bg-slate-800/50 border border-purple-500/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              disabled={loading}
            />
            <p className="text-gray-400 text-sm mt-2">
              {message.length} caracteres
            </p>
          </div>

          {/* Mensagens de Feedback */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg"
            >
              <p className="text-red-300 font-semibold">❌ {error}</p>
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 bg-green-500/20 border border-green-500/50 rounded-lg"
            >
              <p className="text-green-300 font-semibold">
                ✅ Mensagem enviada com sucesso!
                {sentCount !== null && (
                  <span className="block mt-1 text-sm">
                    Enviada para {sentCount} usuário(s)
                  </span>
                )}
              </p>
            </motion.div>
          )}

          {/* Botões */}
          <div className="flex gap-4">
            <button
              onClick={handleSendMessage}
              disabled={loading || !message.trim()}
              className={`
                flex-1 px-6 py-3 rounded-lg font-bold text-white transition-all
                ${loading || !message.trim()
                  ? 'bg-gray-600 cursor-not-allowed opacity-50'
                  : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 hover:scale-105 shadow-lg'
                }
              `}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                  Enviando...
                </span>
              ) : (
                '📤 Enviar para Todos os Usuários'
              )}
            </button>
            <button
              onClick={() => navigate('/admin')}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-all"
            >
              ← Voltar
            </button>
          </div>

          {/* Aviso */}
          <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-yellow-300 text-sm">
              ⚠️ <strong>Atenção:</strong> Esta mensagem será enviada para todos os usuários cadastrados no sistema. 
              Use com responsabilidade.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

