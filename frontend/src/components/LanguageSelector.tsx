import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nContext';
import type { LangCode } from '../i18n';

/** Bandeiras via flagcdn (emoji de bandeira não renderiza bem no Windows). */
const languages: { code: LangCode; label: string; country: string }[] = [
  { code: 'pt-BR', label: 'Português', country: 'br' },
  { code: 'en', label: 'English', country: 'us' },
  { code: 'es', label: 'Español', country: 'es' },
  { code: 'fr', label: 'Français', country: 'fr' },
  { code: 'de', label: 'Deutsch', country: 'de' },
  { code: 'it', label: 'Italiano', country: 'it' },
  { code: 'ja', label: '日本語', country: 'jp' },
];

function FlagImg({ country, label, size = 14 }: { country: string; label: string; size?: number }) {
  return (
    <img
      src={`https://flagcdn.com/w40/${country}.png`}
      srcSet={`https://flagcdn.com/w80/${country}.png 2x`}
      width={size}
      height={Math.round(size * 0.75)}
      alt=""
      title={label}
      className="rounded-[1px] object-cover flex-shrink-0 shadow-sm ring-1 ring-white/15"
      loading="lazy"
      decoding="async"
    />
  );
}

interface LanguageSelectorProps {
  /** Compacto: bandeira + idioma em telas maiores; expandido: sempre mostra o nome */
  variant?: 'compact' | 'full';
  className?: string;
}

export default function LanguageSelector({ variant = 'full', className = '' }: LanguageSelectorProps) {
  const { t, language, setLanguage } = useI18n();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const current = languages.find((l) => l.code === language) ?? languages[0];

  const updateMenuPosition = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  const handleSetLanguage = (code: LangCode) => {
    setLanguage(code);
    setOpen(false);
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleReposition = () => updateMenuPosition();

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open]);

  const menu =
    open &&
    menuPos &&
    createPortal(
      <ul
        ref={menuRef}
        role="listbox"
        style={{ top: menuPos.top, right: menuPos.right }}
        className="fixed z-[9999] py-0.5 min-w-[140px] max-h-[70vh] overflow-y-auto rounded-md border border-white/20 bg-gray-900/95 backdrop-blur-md shadow-xl"
        aria-label={t('common.language')}
      >
        {languages.map((lang) => (
          <li key={lang.code} role="option" aria-selected={language === lang.code}>
            <button
              type="button"
              onClick={() => handleSetLanguage(lang.code)}
              className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-xs transition-colors ${
                language === lang.code
                  ? 'bg-purple-600/30 text-white'
                  : 'text-gray-200 hover:bg-white/10'
              }`}
            >
              <FlagImg country={lang.country} label={lang.label} size={14} />
              <span className="font-medium">{lang.label}</span>
            </button>
          </li>
        ))}
      </ul>,
      document.body,
    );

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-white/90 hover:text-white hover:bg-white/10 border border-white/20 focus:outline-none focus:ring-1 focus:ring-purple-400/50 transition-colors"
        aria-label={t('common.language')}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <FlagImg country={current.country} label={current.label} size={14} />
        <span className={`text-[11px] font-medium leading-none ${variant === 'compact' ? 'hidden sm:inline' : ''}`}>
          {current.label}
        </span>
        <svg
          className={`w-3 h-3 transition-transform flex-shrink-0 opacity-70 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {menu}
    </div>
  );
}
