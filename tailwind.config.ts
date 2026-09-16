import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        rt: {
          bg: '#020617',
          surface: '#0f172a',
          raised: '#0b1220',
          canvas: '#060d1c',
          border: '#1e293b',
          'border-strong': '#334155',
          divider: '#131f36',
          text: '#e2e8f0',
          strong: '#f8fafc',
          heading: '#f1f5f9',
          muted: '#94a3b8',
          dim: '#64748b',
          faint: '#475569',
          accent: '#0284c7',
          'accent-pressed': '#0369a1',
          'accent-light': '#38bdf8',
          success: '#10b981',
          warning: '#f59e0b',
          error: '#e11d48',
          focus: '#8b5cf6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        float: '0 18px 40px rgba(0, 0, 0, 0.45)',
        ai: '0 22px 50px rgba(0, 0, 0, 0.55)',
        'ai-collapsed': '0 12px 28px rgba(0, 0, 0, 0.45)',
      },
      keyframes: {
        'rt-bar': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        'rt-spin': {
          to: { transform: 'rotate(360deg)' },
        },
        'rt-pulse': {
          '0%, 100%': { opacity: '0.25' },
          '50%': { opacity: '0.9' },
        },
      },
      animation: {
        'rt-bar': 'rt-bar 1.4s linear infinite',
        'rt-spin': 'rt-spin 0.8s linear infinite',
        'rt-pulse': 'rt-pulse 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
