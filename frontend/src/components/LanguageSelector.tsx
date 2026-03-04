import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../i18n/I18nContext';

const languages = [
  { code: 'pt-BR' as const, label: 'Português', flag: '🇧🇷' },
  { code: 'en' as const, label: 'English', flag: '🇺🇸' },
  { code: 'es' as const, label: 'Español', flag: '🇪🇸' },
];

interface LanguageSelectorProps {
  /** Compacto: só ícone/bandeira; expandido: mostra label */
  variant?: 'compact' | 'full';
  className?: string;
}

export default function LanguageSelector({ variant = 'full', className = '' }: LanguageSelectorProps) {
  const { t, language, setLanguage } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = languages.find((l) => l.code === language) ?? languages[0];

  const handleSetLanguage = (code: 'pt-BR' | 'en' | 'es') => {
    setLanguage(code);
    setOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-white/90 hover:text-white hover:bg-white/10 border border-white/20 focus:outline-none focus:ring-2 focus:ring-purple-400/50 transition-colors"
        aria-label={t('common.language')}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="text-lg leading-none" aria-hidden>
          {current.flag}
        </span>
        {variant === 'full' && (
          <span className="text-sm font-medium hidden sm:inline">{current.label}</span>
        )}
        <svg
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full mt-1 py-1 min-w-[140px] rounded-lg border border-white/20 bg-gray-900/95 backdrop-blur-md shadow-xl z-50"
          aria-label={t('common.language')}
        >
          {languages.map((lang) => (
            <li key={lang.code} role="option" aria-selected={language === lang.code}>
              <button
                type="button"
                onClick={() => handleSetLanguage(lang.code)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  language === lang.code
                    ? 'bg-purple-600/30 text-white'
                    : 'text-gray-200 hover:bg-white/10'
                }`}
              >
                <span className="text-lg">{lang.flag}</span>
                <span>{lang.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
