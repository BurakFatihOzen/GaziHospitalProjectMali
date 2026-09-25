/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        gazi: {
          navy:       '#003366',
          navyLight:  '#1A4A80',
          navyDark:   '#001F3F',
          navyAlpha:  '#003366CC',
          gold:       '#C5A059',
          goldLight:  '#D4B574',
        },
        clinical: {
          bg:          '#EEF2F7',
          card:        '#FFFFFF',
          border:      '#D1DCE8',
          borderDark:  '#A8BDD4',
          textPrimary: '#1A2942',
          textSecondary: '#4A6080',
          textMuted:   '#8BA0B8',
          rowHover:    '#F0F5FB',
          rowSelected: '#E8EFF8',
        },
        severity: {
          normal:       '#10B981',
          normalBg:     '#D1FAE5',
          mild:         '#F59E0B',
          mildBg:       '#FEF3C7',
          moderate:     '#F97316',
          moderateBg:   '#FFEDD5',
          severe:       '#EF4444',
          severeBg:     '#FEE2E2',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        card:    '0 1px 4px 0 rgba(0,51,102,0.08), 0 0 0 1px rgba(0,51,102,0.04)',
        cardLg:  '0 4px 16px 0 rgba(0,51,102,0.12), 0 0 0 1px rgba(0,51,102,0.06)',
        header:  '0 2px 8px 0 rgba(0,31,63,0.18)',
      },
      animation: {
        'fade-in':    'fadeIn 0.15s ease-out',
        'slide-up':   'slideUp 0.2s ease-out',
        'spin-slow':  'spin 1.5s linear infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
