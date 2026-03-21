import { useState, FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import ArenaFullBleedBackground from '../components/ArenaFullBleedBackground';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setMessage('A senha deve ter pelo menos 6 caracteres.');
      setStatus('error');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('As senhas não coincidem.');
      setStatus('error');
      return;
    }
    if (!token) {
      setMessage('Link inválido.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      const { data } = await axios.post(`${API_URL}/auth/reset-password/${token}`, { newPassword });
      setStatus('success');
      setMessage(data.message);
    } catch (err: any) {
      setStatus('error');
      setMessage(err.response?.data?.message || 'Erro ao redefinir senha. O link pode ter expirado.');
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
            Nova senha
          </h1>
          <p className="text-white/70 text-sm mb-6">
            Digite e confirme sua nova senha (mínimo 6 caracteres).
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
              <label htmlFor="new-password" className="block text-sm font-medium text-white/90">
                Nova senha
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full py-2.5 pl-3 pr-10 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400/60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-white/60 hover:text-white"
                  title={showPassword ? 'Ocultar' : 'Mostrar'}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>

              <label htmlFor="confirm-password" className="block text-sm font-medium text-white/90">
                Confirmar senha
              </label>
              <input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full py-2.5 px-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400/60"
              />

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full py-2.5 rounded-lg font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-60 transition-all"
              >
                {status === 'loading' ? 'Salvando...' : 'Redefinir senha'}
              </button>
            </form>
          )}

          <p className="mt-6 text-center">
            <Link to="/login" className="text-sm text-purple-300 hover:text-white font-medium transition-colors">
              {status === 'success' ? 'Fazer login' : '← Voltar ao login'}
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
