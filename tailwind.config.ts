import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        surface2: 'rgb(var(--c-surface-2) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        gold: 'rgb(var(--c-gold) / <alpha-value>)',
        goldsoft: 'rgb(var(--c-gold-soft) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        ok: 'rgb(var(--c-ok) / <alpha-value>)',
        bad: 'rgb(var(--c-bad) / <alpha-value>)',
        info: 'rgb(var(--c-info) / <alpha-value>)',
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
        lock: 'rgb(var(--c-lock) / <alpha-value>)',
      },
      borderRadius: { card: '16px', xl2: '18px' },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.20), 0 8px 24px -12px rgb(0 0 0 / 0.35)',
        pop: '0 12px 40px -8px rgb(0 0 0 / 0.55)',
      },
      fontFamily: {
        sans: ['var(--font-ui)', 'system-ui', 'sans-serif'],
        num: ['var(--font-num)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
