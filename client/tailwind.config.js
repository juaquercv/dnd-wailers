/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          300: '#8a7f70',
          400: '#655b4f',
          500: '#4a4239',
          600: '#36302a',
          700: '#27231d',
          800: '#1c1915',
          900: '#13110e',
          950: '#0b0a08',
        },
        parchment: {
          50: '#fbf6ea',
          100: '#f3ead6',
          200: '#e6d8b8',
          300: '#cdb98f',
          400: '#a8946b',
          500: '#857352',
        },
        gold: {
          100: '#fcf1d2',
          200: '#f8e4ae',
          300: '#f3d58a',
          400: '#e9c063',
          500: '#d4a63f',
          600: '#b0852b',
          700: '#7d5d1d',
          800: '#553f14',
          900: '#33260c',
        },
        blood: {
          300: '#ef8f88',
          400: '#e0625a',
          500: '#c43d33',
          600: '#9b2c24',
          700: '#6e1f19',
          800: '#45130f',
        },
        arcane: {
          300: '#c7b4ff',
          400: '#a98bff',
          500: '#8a63f0',
          600: '#6a45c9',
          700: '#4a2f8f',
        },
      },
      fontFamily: {
        display: ['Cinzel', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 10px 30px -12px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(243, 234, 214, 0.04)',
        'glow-gold': '0 0 0 1px rgba(233, 192, 99, 0.35), 0 0 24px -4px rgba(233, 192, 99, 0.45)',
        'glow-blood': '0 0 0 1px rgba(224, 98, 90, 0.35), 0 0 24px -4px rgba(224, 98, 90, 0.45)',
        'glow-arcane': '0 0 0 1px rgba(169, 139, 255, 0.35), 0 0 24px -4px rgba(169, 139, 255, 0.45)',
        modal: '0 30px 80px -20px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(212, 166, 63, 0.18)',
      },
      backgroundImage: {
        'gold-sheen': 'linear-gradient(180deg, #f3d58a 0%, #e9c063 35%, #d4a63f 70%, #b0852b 100%)',
        'panel-sheen': 'linear-gradient(180deg, rgba(243, 234, 214, 0.035) 0%, rgba(243, 234, 214, 0) 40%)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(24px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.94) translateY(6px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        pop: {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '60%': { transform: 'scale(1.08)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '10%, 50%, 90%': { transform: 'translate3d(-6px, 2px, 0)' },
          '30%, 70%': { transform: 'translate3d(6px, -2px, 0)' },
          '20%, 60%': { transform: 'translate3d(-3px, -3px, 0)' },
          '40%, 80%': { transform: 'translate3d(3px, 3px, 0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.65', filter: 'drop-shadow(0 0 6px rgba(233, 192, 99, 0.35))' },
          '50%': { opacity: '1', filter: 'drop-shadow(0 0 18px rgba(233, 192, 99, 0.75))' },
        },
        ember: {
          '0%': { transform: 'translate3d(0, 0, 0) scale(1)', opacity: '0' },
          '10%': { opacity: '0.9' },
          '70%': { opacity: '0.6' },
          '100%': { transform: 'translate3d(var(--ember-drift, 20px), -85vh, 0) scale(0.3)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'progress-shrink': {
          from: { transform: 'scaleX(1)' },
          to: { transform: 'scaleX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'slide-up': 'slide-up 280ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-right': 'slide-in-right 260ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
        pop: 'pop 320ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        shake: 'shake 450ms ease-in-out both',
        float: 'float 4s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2.6s ease-in-out infinite',
        'spin-slow': 'spin 8s linear infinite',
        ember: 'ember 9s linear infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        'progress-shrink': 'progress-shrink 4s linear forwards',
      },
      zIndex: {
        60: '60',
        70: '70',
        80: '80',
        90: '90',
        100: '100',
      },
    },
  },
  plugins: [],
};
