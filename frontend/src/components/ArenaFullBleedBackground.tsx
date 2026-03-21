import React, { useCallback, useMemo, useState } from 'react';
import { arenaBackgroundUrls } from '../utils/arenaBackgroundUrls';

type Props = {
  /** Caminho sem extensão, ex.: `/images/background` ou `/images/backgroundLogin` */
  basePathWithoutExt?: string;
  /** Classes Tailwind extras no elemento raiz */
  className?: string;
  /** Classe de empilhamento (ex.: `-z-10` na arena, `z-0` no layout com overlay) */
  zIndexClass?: string;
};

/**
 * Fundo full-screen: tenta carregar `basePath` + [.webp, .jpg, .jpeg, …] até uma imagem existir.
 */
const ArenaFullBleedBackground: React.FC<Props> = ({
  basePathWithoutExt = '/images/background',
  className = '',
  zIndexClass = '-z-10',
}) => {
  const urls = useMemo(() => arenaBackgroundUrls(basePathWithoutExt), [basePathWithoutExt]);
  const [index, setIndex] = useState(0);

  const onError = useCallback(() => {
    setIndex((i) => Math.min(i + 1, urls.length));
  }, [urls.length]);

  if (index >= urls.length) {
    return (
      <div
        className={`fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 ${zIndexClass} ${className}`}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={urls[index]}
      alt=""
      className={`fixed inset-0 h-full w-full object-cover pointer-events-none ${zIndexClass} ${className}`}
      onError={onError}
      decoding="async"
      draggable={false}
    />
  );
};

export default ArenaFullBleedBackground;
