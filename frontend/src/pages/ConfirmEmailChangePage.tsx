import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import ArenaFullBleedBackground from '../components/ArenaFullBleedBackground';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function ConfirmEmailChangePage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const confirm = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Link inválido.');
        return;
      }
      try {
        const response = await axios.get(`${API_URL}/auth/confirm-email-change/${token}`);
        setStatus('success');
        setMessage(response.data?.message || 'Email alterado com sucesso.');
      } catch (error: any) {
        setStatus('error');
        setMessage(error.response?.data?.message || 'Link inválido ou expirado. Solicite a troca novamente no perfil.');
      }
    };
    confirm();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <ArenaFullBleedBackground basePathWithoutExt="/images/backgroundLogin" zIndexClass="fixed inset-0 z-0" />
      <div className="absolute inset-0 z-[1] bg-black/60" aria-hidden />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 max-w-md w-full"
      >
        {status === 'loading' && (
          <div className="rounded-xl border border-white/15 bg-black/40 backdrop-blur-sm p-8 text-center">
            <div className="flex justify-center mb-6">
              <div className="animate-spin rounded-full h-12 w-12 border-2 border-purple-400 border-t-transparent" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Confirmando troca de email...</h1>
            <p className="text-white/60 text-sm">Aguarde um momento.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="rounded-xl border border-green-500/40 bg-black/40 backdrop-blur-sm p-8 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 10 }}
              className="text-5xl mb-4"
            >
              ✅
            </motion.div>
            <h1 className="text-2xl font-bold text-green-400 mb-4">Email alterado!</h1>
            <p className="text-white/80 mb-6">{message}</p>
            <Link
              to="/login"
              className="inline-block py-2.5 px-6 rounded-lg font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all"
            >
              Fazer login
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-xl border border-red-500/40 bg-black/40 backdrop-blur-sm p-8 text-center">
            <div className="text-5xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-red-400 mb-4">Não foi possível alterar o email</h1>
            <p className="text-white/80 mb-6">{message}</p>
            <Link
              to="/login"
              className="inline-block py-2.5 px-6 rounded-lg font-semibold text-white bg-slate-600 hover:bg-slate-500 transition-colors"
            >
              Ir para o login
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}
