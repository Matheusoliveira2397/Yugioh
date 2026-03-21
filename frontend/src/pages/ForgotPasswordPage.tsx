import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import ArenaFullBleedBackground from '../components/ArenaFullBleedBackground';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    setMessage('');
    try {
      const { data } = await axios.post(`${API_URL}/auth/forgot-password`, { email: email.trim().toLowerCase() });
      setStatus('success');
      setMessage(data.message);
    } catch (err: any) {
      setStatus('error');
      setMessage(err.response?.data?.message || 'Erro ao enviar. Tente novamente.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <ArenaFullBleedBackground basePathWithoutExt="/images/backgroundLogin" zIndexClass="fixed inset-0 z-0" />
      <div className="absolute inset-0 z-[1] bg-black/60" aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 max-w-md w-full"
      >
        <div className="rounded-xl border border-white/15 bg-black/40 backdrop-blur-sm p-6 sm:p-8 shadow-xl">
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-1">
            Esqueceu a senha?
          </h1>
          <p className="text-white/70 text-sm mb-6">
            Digite o email da sua conta e enviaremos um link para redefinir a senha.
          </p>

          {status === 'success' && (
            <div className="mb-4 p-3 rounded-lg bg-green-500/20 border border-green-500/40 text-green-200 text-sm">
              {message}
            </div>
          )}
          {status === 'error' && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 text-sm">
              {message}
            </div>
          )}

          {status !== 'success' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label htmlFor="forgot-email" className="block text-sm font-medium text-white/90">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full py-2.5 px-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400/60"
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full py-2.5 rounded-lg font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-60 transition-all"
              >
                {status === 'loading' ? 'Enviando...' : 'Enviar link'}
              </button>
            </form>
          )}

          <p className="mt-6 text-center">
            <Link to="/login" className="text-sm text-purple-300 hover:text-white font-medium transition-colors">
              ← Voltar ao login
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
