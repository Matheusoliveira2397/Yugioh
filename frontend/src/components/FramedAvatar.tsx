import { getProfileImageUrl, DEFAULT_PROFILE_IMAGE_PATH } from '../utils/imageUrl';
import { getAvatarFrame } from '../constants/avatarFrames';

interface FramedAvatarProps {
  src?: string | null;
  alt?: string;
  frameId?: string | null;
  /** Tamanho da FOTO (a moldura cresce para fora) */
  className?: string;
  imgClassName?: string;
  rounded?: 'full' | 'xl' | '2xl' | 'lg' | 'md' | 'none';
  onErrorSrc?: string;
}

const roundedMap = {
  full: 'rounded-full',
  '2xl': 'rounded-2xl',
  xl: 'rounded-xl',
  lg: 'rounded-lg',
  md: 'rounded-md',
  none: 'rounded-none',
} as const;

/**
 * Avatar com moldura dos Deuses Egípcios.
 * Foto limpa no furo circular; deus + ornamentos ficam por FORA.
 */
export default function FramedAvatar({
  src,
  alt = '',
  frameId,
  className = 'w-24 h-24',
  imgClassName = '',
  rounded = '2xl',
  onErrorSrc = DEFAULT_PROFILE_IMAGE_PATH,
}: FramedAvatarProps) {
  const frame = getAvatarFrame(frameId);
  const photoSrc =
    typeof src === 'string' && (src.startsWith('blob:') || src.startsWith('data:'))
      ? src
      : getProfileImageUrl(src);
  const roundClass = roundedMap[rounded];

  if (!frame) {
    return (
      <div className={`relative overflow-hidden ${roundClass} ${className}`}>
        <img
          src={photoSrc}
          alt={alt}
          className={`w-full h-full object-cover ${imgClassName}`}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.src = onErrorSrc;
          }}
        />
      </div>
    );
  }

  const bleed = frame.outerBleedPercent;
  const scale = frame.photoScale;

  return (
    <div className={`relative overflow-visible ${className}`}>
      {/* Brilho suave atrás da moldura */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          top: `-${bleed * 0.55}%`,
          left: `-${bleed * 0.55}%`,
          width: `${100 + bleed * 1.1}%`,
          height: `${100 + bleed * 1.1}%`,
          background: `radial-gradient(circle, ${frame.glow} 0%, transparent 68%)`,
          zIndex: 0,
          filter: 'blur(6px)',
        }}
        aria-hidden
      />

      {/* Arte da moldura (deus nas bordas) — maior que a foto */}
      <img
        src={frame.image}
        alt=""
        aria-hidden
        className="absolute max-w-none pointer-events-none select-none object-cover drop-shadow-2xl"
        style={{
          top: `-${bleed}%`,
          left: `-${bleed}%`,
          width: `${100 + bleed * 2}%`,
          height: `${100 + bleed * 2}%`,
          zIndex: 1,
        }}
        draggable={false}
      />

      {/* Foto no furo circular, por cima do centro escuro da arte */}
      <div
        className={`absolute z-10 overflow-hidden rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.65)] ring-2 ${frame.accentClass}`}
        style={{
          top: `${((1 - scale) / 2) * 100}%`,
          left: `${((1 - scale) / 2) * 100}%`,
          width: `${scale * 100}%`,
          height: `${scale * 100}%`,
        }}
      >
        <img
          src={photoSrc}
          alt={alt}
          className={`h-full w-full object-cover ${imgClassName}`}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.src = onErrorSrc;
          }}
        />
      </div>
    </div>
  );
}
