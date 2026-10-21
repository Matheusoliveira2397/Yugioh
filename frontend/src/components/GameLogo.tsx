interface GameLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function GameLogo({ className = '', size = 'md' }: GameLogoProps) {
  const sizeClasses = {
    sm: 'h-8 sm:h-10',
    md: 'h-10 sm:h-12 md:h-14 lg:h-16',
    lg: 'h-16 sm:h-20 md:h-24 lg:h-28',
  };

  return (
    <svg
      className={`${sizeClasses[size]} ${className}`}
      viewBox="0 0 400 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Yu-Gi-Oh!"
    >
      <defs>
        <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#F0D878" />
          <stop offset="45%" stopColor="#E8C547" />
          <stop offset="100%" stopColor="#C9A227" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <text
        x="200"
        y="48"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="40"
        fontWeight="800"
        fill="url(#logoGradient)"
        fontFamily="Cinzel, Georgia, serif"
        filter="url(#glow)"
        letterSpacing="2"
      >
        Yu-Gi-Oh!
      </text>

      <line
        x1="72"
        y1="62"
        x2="328"
        y2="62"
        stroke="url(#logoGradient)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx="92" cy="62" r="2.5" fill="#E8C547" opacity="0.95" />
      <circle cx="308" cy="62" r="2.5" fill="#E8C547" opacity="0.95" />
    </svg>
  );
}
