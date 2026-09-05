import type { Config } from 'tailwindcss';

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: token('c-bg'),
        surface: token('c-surface'),
        surface2: token('c-surface-2'),
        line: token('c-line'),
        gold: token('c-gold'),
        goldsoft: token('c-gold-soft'),
        ink: token('c-ink'),
        muted: token('c-muted'),
        ok: token('c-ok'),
        bad: token('c-bad'),
        info: token('c-info'),
        warn: token('c-warn'),
        purple: token('c-purple'),
        'st-ordered': token('st-ordered'),
        'st-maker': token('st-maker'),
        'st-ready': token('st-ready'),
        'st-traveler': token('st-traveler'),
        'st-arrived': token('st-arrived'),
        'st-delivered': token('st-delivered'),
        'st-cancelled': token('st-cancelled'),
        'st-overdue': token('st-overdue'),
      },
      borderRadius: { card: '18px', xl2: '20px' },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.18), 0 10px 30px -16px rgb(0 0 0 / 0.45)',
        pop: '0 16px 48px -10px rgb(0 0 0 / 0.6)',
      },
      fontFamily: {
        sans: ['var(--font-ui)', 'system-ui', 'sans-serif'],
        num: ['var(--font-num)', 'ui-monospace', 'monospace'],
      },
    },
  },
  safelist: [
    { pattern: /(bg|text|border)-st-(ordered|maker|ready|traveler|arrived|delivered|cancelled|overdue)/ },
  ],
  plugins: [],
};
export default config;
