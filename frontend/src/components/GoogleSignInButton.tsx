import { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface GoogleSignInButtonProps {
  label?: string;
  className?: string;
  /** Exibe aviso abaixo do botão se OAuth não estiver configurado no backend */
  showConfigHint?: boolean;
}

export default function GoogleSignInButton({
  label = 'Continuar com Google',
  className = '',
  showConfigHint = false,
}: GoogleSignInButtonProps) {
  const [enabled, setEnabled] = useState(true);
  const [checking, setChecking] = useState(true);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API_URL}/auth/providers`, { timeout: 8000 })
      .then((r) => {
        if (!cancelled) setEnabled(Boolean(r.data?.google));
      })
      .catch(() => {
        // Mantém o botão visível; o clique valida no backend
        if (!cancelled) setEnabled(true);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startGoogle = () => {
    setLocalError('');
    if (!checking && !enabled) {
      setLocalError(
        'Login com Google ainda não está configurado. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env do backend.',
      );
      return;
    }
    window.location.href = `${API_URL}/auth/google`;
  };

  return (
    <div className="w-full flex flex-col gap-1.5">
      <button
        type="button"
        onClick={startGoogle}
        disabled={checking}
        className={
          className ||
          'w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg text-sm font-semibold bg-white text-slate-800 hover:bg-slate-100 border border-white/20 transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-white/40 disabled:opacity-60'
        }
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path
            fill="#FFC107"
            d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
          />
          <path
            fill="#FF3D00"
            d="M6.3 14.7l6.6 4.8C14.7 16.2 19 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
          />
          <path
            fill="#4CAF50"
            d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
          />
          <path
            fill="#1976D2"
            d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l.1.1 6.3 5.2C39.2 37.1 44 32 44 24c0-1.2-.1-2.3-.4-3.5z"
          />
        </svg>
        <span>{checking ? 'Carregando…' : label}</span>
      </button>
      {(localError || (showConfigHint && !checking && !enabled)) && (
        <p className="text-xs text-amber-200/90 text-center leading-snug">
          {localError ||
            'Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no backend para ativar.'}
        </p>
      )}
    </div>
  );
}
