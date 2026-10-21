/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#c9a227',
        secondary: '#1a2744',
        accent: '#e8c547',
        arena: {
          void: '#07090f',
          ink: '#0c1220',
          navy: '#121a2e',
          steel: '#1e2a44',
          mist: '#8b9bb8',
        },
        champion: {
          gold: '#e8c547',
          amber: '#c9a227',
          bronze: '#a67c3d',
          crimson: '#c43c3c',
          cyan: '#3db8c5',
        },
      },
      fontFamily: {
        display: ['"Cinzel"', 'Georgia', 'serif'],
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'gold-sm': '0 0 12px rgba(232, 197, 71, 0.25)',
        'gold-md': '0 0 24px rgba(232, 197, 71, 0.35)',
        'arena': '0 8px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        'panel': '0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(232, 197, 71, 0.12)',
      },
      backgroundImage: {
        'duel-field': "url('/duel-field.jpg')",
        'arena-radial':
          'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(201, 162, 39, 0.12), transparent 55%)',
        'panel-shine':
          'linear-gradient(135deg, rgba(232, 197, 71, 0.08) 0%, transparent 40%, transparent 60%, rgba(61, 184, 197, 0.04) 100%)',
      },
      keyframes: {
        'gold-pulse': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(232, 197, 71, 0.2)' },
          '50%': { boxShadow: '0 0 20px rgba(232, 197, 71, 0.45)' },
        },
        'nav-underline': {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        'fade-rise': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'gold-pulse': 'gold-pulse 2.4s ease-in-out infinite',
        'nav-underline': 'nav-underline 0.25s ease-out forwards',
        'fade-rise': 'fade-rise 0.4s ease-out forwards',
      },
      screens: {
        'xs': '475px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
    },
  },
  plugins: [],
}
