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
    >
      <defs>
        {/* Gradiente estilo Realm - roxo/azul/rosa */}
        <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="50%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
        
        {/* Sombra/glow */}
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Texto principal */}
      <text
        x="200"
        y="50"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="42"
        fontWeight="900"
        fill="url(#logoGradient)"
        fontFamily="Arial, sans-serif"
        filter="url(#glow)"
        style={{
          letterSpacing: '1px',
          textShadow: '0 0 20px rgba(139, 92, 246, 0.5)',
        }}
      >
        Yu-Gi-Oh!
      </text>
      
      {/* Linha decorativa abaixo */}
      <line
        x1="80"
        y1="60"
        x2="320"
        y2="60"
        stroke="url(#logoGradient)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.8"
      />
      
      {/* Pontos decorativos */}
      <circle cx="100" cy="60" r="2" fill="url(#logoGradient)" opacity="0.9" />
      <circle cx="300" cy="60" r="2" fill="url(#logoGradient)" opacity="0.9" />
    </svg>
  );
}

