import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { motion } from 'framer-motion';
import ArenaFullBleedBackground from '../components/ArenaFullBleedBackground';

export default function LoginMasterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { loginMaster } = useAuthStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await loginMaster(username, password);
      navigate('/admin');
    } catch (err: any) {
      const message = err.response?.data?.message || 'Login ou senha incorretos.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <ArenaFullBleedBackground basePathWithoutExt="/images/backgroundLogin" zIndexClass="fixed inset-0 z-0" />
      <div className="absolute inset-0 z-[1] bg-black/60 backdrop-blur-sm" aria-hidden />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-amber-500/30 bg-black/70 backdrop-blur-md shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-amber-500/20 bg-amber-500/10">
          <h1 className="text-xl font-bold text-amber-200 flex items-center gap-2">
            <span>👑</span> Login Master
          </h1>
          <p className="text-amber-200/70 text-sm mt-0.5">
            Apenas contas Master podem acessar por esta rota.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg px-3 py-2.5 text-sm bg-red-500/20 border border-red-500/40 text-red-100">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="master-username" className="block text-amber-200/90 text-sm font-medium mb-1">
              Usuário ou e-mail
            </label>
            <input
              id="master-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full py-2.5 px-3 rounded-lg text-sm bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400/50"
              placeholder="Usuário ou e-mail"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="master-password" className="block text-amber-200/90 text-sm font-medium mb-1">
              Senha
            </label>
            <div className="relative">
              <input
                id="master-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full py-2.5 pl-3 pr-10 rounded-lg text-sm bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400/50"
                placeholder="Senha"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-black bg-amber-400 hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:pointer-events-none transition-all"
          >
            {loading ? 'Entrando…' : 'Entrar como Master'}
          </button>
        </form>

        <div className="px-6 pb-4 pt-0">
          <Link
            to="/"
            className="text-amber-200/80 hover:text-amber-200 text-sm transition-colors"
          >
            ← Voltar ao início
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
