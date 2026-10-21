import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import ArenaFullBleedBackground from '../components/ArenaFullBleedBackground';

export default function AuthGoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const loginWithSession = useAuthStore((s) => s.loginWithSession);
  const [error, setError] = useState('');

  useEffect(() => {
    const err = searchParams.get('error');
    const code = searchParams.get('code');

    if (err) {
      setError(decodeURIComponent(err));
      return;
    }
    if (!code) {
      setError('Código de autenticação ausente. Tente novamente.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { needsNicknameSetup } = await loginWithSession(code);
        if (!cancelled) {
          navigate(needsNicknameSetup ? '/auth/choose-nickname' : '/home', { replace: true });
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(
            e?.response?.data?.message ||
              e?.message ||
              'Falha ao concluir login com Google. Tente novamente.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, loginWithSession, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-4">
      <ArenaFullBleedBackground basePathWithoutExt="/images/backgroundLogin" zIndexClass="fixed inset-0 z-0" />
      <div className="absolute inset-0 z-[1] bg-black/55 backdrop-blur-[2px]" aria-hidden />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-black/50 border border-white/15 backdrop-blur-md p-8 text-center">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-white mb-3">Não foi possível entrar</h1>
            <p className="text-sm text-red-200 mb-6">{error}</p>
            <Link
              to="/login"
              className="inline-flex py-2.5 px-5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
            >
              Voltar ao login
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            <h1 className="text-xl font-semibold text-white mb-2">Entrando com Google…</h1>
            <p className="text-sm text-white/70">Aguarde enquanto finalizamos sua sessão.</p>
          </>
        )}
      </div>
    </div>
  );
}
