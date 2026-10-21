type Props = {
  maxCopiesInDeck?: number | null;
  /** `floating` = canto superior direito absoluto; `inline` = só o círculo (para empilhar com outros badges) */
  variant?: 'floating' | 'inline';
  className?: string;
  /**
   * Se true, também exibe “3” quando a carta permite o máximo normal (útil na loja).
   * Sem isso, só aparece 0 (banida), 1 e 2 (limitada / semi-limitada).
   */
  showStandardLimit?: boolean;
};

const baseCircle =
  'pointer-events-none flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-black/85 text-[11px] font-bold leading-none shadow-md';

/**
 * Indica quantas cópias com o mesmo nome podem ir ao deck (principal ou extra).
 * Com `showStandardLimit`, mostra também 3; caso contrário só destaca 0/1/2.
 */
export default function DeckCopyLimitBadge({
  maxCopiesInDeck,
  variant = 'floating',
  className = '',
  showStandardLimit = false,
}: Props) {
  const m = maxCopiesInDeck ?? 3;
  if (m < 0) return null;
  if (m === 3 && !showStandardLimit) return null;

  let title: string;
  let ring: string;
  if (m === 0) {
    title = 'Banida — não pode no deck';
    ring = 'border-red-500/95 text-red-200';
  } else if (m === 1) {
    title = 'No máximo 1 cópia no deck';
    ring = 'border-amber-400/90 text-amber-200';
  } else if (m === 2) {
    title = 'No máximo 2 cópias no deck';
    ring = 'border-amber-400/90 text-amber-200';
  } else {
    title =
      m === 3
        ? 'Até 3 cópias com o mesmo nome no deck (principal ou extra)'
        : `No máximo ${m} cópias no deck`;
    ring = 'border-slate-500/90 text-slate-200';
  }

  const pos = variant === 'floating' ? 'absolute top-1 right-1 z-20' : 'relative';

  return (
    <div className={`${pos} ${baseCircle} ${ring} ${className}`.trim()} title={title}>
      {m}
    </div>
  );
}
