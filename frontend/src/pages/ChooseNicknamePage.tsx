import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import ArenaFullBleedBackground from '../components/ArenaFullBleedBackground';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function ChooseNicknamePage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, completeGoogleNickname } = useAuthStore();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.nickname) setNickname(user.nickname);
  }, [user?.nickname]);

  useEffect(() => {
    const trimmed = nickname.trim();
    if (trimmed.length < 3) {
      setAvailable(null);
      setMessage('');
      return;
    }

    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.get(`${API_URL}/auth/check-nickname`, {
          params: { nickname: trimmed },
          timeout: 8000,
        });
        // Se for o nick atual do próprio usuário, considerar disponível
        const isOwn = user?.nickname?.trim().toLowerCase() === trimmed.toLowerCase();
        setAvailable(Boolean(data.available) || isOwn);
        setMessage(isOwn ? 'Este será o seu nick no jogo' : data.message);
      } catch {
        setAvailable(null);
        setMessage('');
      } finally {
        setChecking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [nickname, user?.nickname]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.profileSetupCompleted !== false) {
    return <Navigate to="/home" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmed = nickname.trim();
    if (trimmed.length < 3) {
      setError('Nickname deve ter pelo menos 3 caracteres.');
      return;
    }
    if (available === false) {
      setError('Este nickname já está em uso.');
      return;
    }

    setLoading(true);
    try {
      await completeGoogleNickname(trimmed);
      navigate('/home', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Não foi possível salvar o nickname.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-4">
      <ArenaFullBleedBackground basePathWithoutExt="/images/backgroundLogin" zIndexClass="fixed inset-0 z-0" />
      <div className="absolute inset-0 z-[1] bg-black/55 backdrop-blur-[2px]" aria-hidden />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-black/50 border border-white/15 backdrop-blur-md p-8">
        <h1 className="text-2xl font-semibold text-white mb-2 text-center">Escolha seu nick</h1>
        <p className="text-sm text-white/70 mb-6 text-center">
          Esse será o nome exibido no jogo. A foto do Google não é usada — você pode trocar o avatar depois no perfil.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="nickname" className="block text-sm font-medium text-white/90 mb-1.5">
              Nickname
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={50}
              className="w-full py-2.5 px-3 rounded-lg text-sm bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400/50"
              placeholder="Ex.: ReiDosDuelos"
              required
              autoFocus
            />
            {checking && <p className="text-xs text-white/50 mt-1.5">Verificando…</p>}
            {!checking && message && (
              <p className={`text-xs mt-1.5 ${available ? 'text-emerald-300' : 'text-red-300'}`}>
                {message}
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-lg px-3 py-2 text-sm border border-red-400/40 bg-red-500/10 text-red-100">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || checking || available === false || nickname.trim().length < 3}
            className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Salvando…' : 'Continuar'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-white/40">
          <Link to="/login" className="hover:text-white/70 underline underline-offset-2">
            Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  );
}
