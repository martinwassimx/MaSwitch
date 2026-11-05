/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ms: {
          bg: 'rgb(var(--ms-bg) / <alpha-value>)',
          sidebar: 'rgb(var(--ms-sidebar) / <alpha-value>)',
          surface: 'rgb(var(--ms-surface) / <alpha-value>)',
          elevated: 'rgb(var(--ms-elevated) / <alpha-value>)',
          card: 'rgb(var(--ms-card) / <alpha-value>)',
          border: 'rgb(var(--ms-border) / <alpha-value>)',
          accent: 'rgb(var(--ms-accent) / <alpha-value>)',
          accentHover: 'rgb(var(--ms-accent-hover) / <alpha-value>)',
          violet: 'rgb(var(--ms-violet) / <alpha-value>)',
          text: 'rgb(var(--ms-text) / <alpha-value>)',
          muted: 'rgb(var(--ms-muted) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'Geist',
          'Segoe UI Variable Text',
          'Segoe UI',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        display: [
          'Inter',
          'Geist',
          'Segoe UI Variable Display',
          'Segoe UI',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: ['Cascadia Code', 'JetBrains Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.35)',
        card: '0 4px 16px -4px rgba(0, 0, 0, 0.45)',
        glow: '0 0 0 1px rgb(var(--ms-accent) / 0.35)',
        'glow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
      },
    },
  },
  plugins: [],
};
