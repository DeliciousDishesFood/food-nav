/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 所有主题色走 CSS 变量：html.dark 下整体切换成暗系紫黑贴纸风
        food: {
          bg: 'var(--food-bg)',
          primary: 'var(--food-primary)',
          sky: 'var(--food-sky)',
          mint: 'var(--food-mint)',
          sun: 'var(--food-sun)',
          dark: 'var(--food-dark)',
          text: 'var(--food-text)',
          muted: 'var(--food-muted)',
          cardBorder: 'var(--food-card-border)',
          tagBg: 'var(--food-tag-bg)',
          surface: 'var(--food-surface)',
          surface2: 'var(--food-surface-2)',
          surface3: 'var(--food-surface-3)',
          line: 'var(--food-line)',
          accentSoft: 'var(--food-accent-soft)',
          ring: 'var(--food-ring)',
          soft: 'var(--food-soft)',
        },
      },
      fontFamily: {
        sans: [
          '"Noto Sans SC"',
          '"M PLUS Rounded 1c"',
          'system-ui',
          'sans-serif',
        ],
        rounded: ['"M PLUS Rounded 1c"', '"Noto Sans SC"', 'system-ui'],
        display: ['"ZCOOL KuaiLe"', '"M PLUS Rounded 1c"', 'system-ui'],
      },
      boxShadow: {
        // 硬偏移阴影同样由变量驱动，暗色下换成更深的贴纸阴影
        foodCard: 'var(--shadow-card)',
        foodCardHover: 'var(--shadow-card-hover)',
        foodHeader: 'var(--shadow-header)',
        foodSticker: 'var(--shadow-sticker)',
        foodFocus: 'var(--shadow-focus)',
        foodTab: 'var(--shadow-tab)',
        foodTag: 'var(--shadow-tag)',
      },
      borderRadius: {
        media: '16px',
        pill: '9999px',
      },
      fontSize: {
        'page-title': ['24px', { lineHeight: '1.35' }],
        'section-title': ['20px', { lineHeight: '1.4' }],
        'card-title': ['16px', { lineHeight: '1.5' }],
        'card-desc': ['13px', { lineHeight: '1.65' }],
        control: ['14px', { lineHeight: '1.5' }],
      },
      keyframes: {
        'petal-fall': {
          '0%': {
            transform: 'translateY(-10vh) rotate(0deg)',
            opacity: '0',
          },
          '10%': { opacity: '1' },
          '100%': {
            transform: 'translateY(110vh) rotate(360deg)',
            opacity: '0',
          },
        },
        twinkle: {
          '0%, 100%': { opacity: '0.2', transform: 'scale(0.8)' },
          '50%': { opacity: '1', transform: 'scale(1.15)' },
        },
        bob: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translate(-50%, 8px)' },
          '100%': { opacity: '1', transform: 'translate(-50%, 0)' },
        },
      },
      animation: {
        'petal-fall': 'petal-fall linear infinite',
        twinkle: 'twinkle ease-in-out infinite',
        bob: 'bob ease-in-out infinite',
        'toast-in': 'toast-in 0.2s ease-out both',
      },
    },
  },
  plugins: [],
}
