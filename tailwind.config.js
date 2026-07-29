/** @type {import('tailwindcss').Config} */
// Aetheric Enterprise design system (ported from the Stitch export).
// "Quiet luxury": monochromatic charcoal surfaces + Electric Indigo reserved
// for AI/focus, Geist + JetBrains Mono, Material-You semantic tokens.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#101417',
        surface: '#101417',
        'surface-dim': '#101417',
        'surface-bright': '#36393e',
        'surface-container-lowest': '#0b0f12',
        'surface-container-low': '#181c20',
        'surface-container': '#1c2024',
        'surface-container-high': '#272a2e',
        'surface-container-highest': '#323539',
        'on-background': '#e0e2e8',
        'on-surface': '#e0e2e8',
        'on-surface-variant': '#c4c7c8',
        outline: '#8e9192',
        'outline-variant': '#444748',
        // Primary = high-contrast white (dark theme).
        primary: '#ffffff',
        'on-primary': '#2f3131',
        'primary-container': '#e2e2e2',
        'primary-fixed-dim': '#c6c6c7',
        // Secondary = Electric Indigo — reserved for AI, focus, primary status.
        secondary: '#c0c1ff',
        'on-secondary': '#1000a9',
        'secondary-container': '#3131c0',
        'on-secondary-container': '#b0b2ff',
        'secondary-fixed': '#e1e0ff',
        // Status (desaturated to keep the "quiet" aesthetic).
        success: '#5ec98a',
        'success-container': '#0f3d29',
        warning: '#e0b252',
        'warning-container': '#402f10',
        error: '#ffb4ab',
        'on-error': '#690005',
        'error-container': '#93000a',
        'on-error-container': '#ffdad6',
      },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '600' }],
        'display-sm': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '600' }],
        'headline-sm': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '500' }],
        'title-md': ['16px', { lineHeight: '24px', fontWeight: '500' }],
        'body-md': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'label-caps': ['11px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '500' }],
        'data-mono': ['12px', { lineHeight: '16px', fontWeight: '400' }],
      },
      spacing: {
        gutter: '16px',
        'margin-desktop': '32px',
        'ai-panel': '380px',
        sidebar: '256px',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.20)',
        glow: '0 0 0 1px rgb(49 49 192 / 0.30), 0 8px 24px -8px rgb(49 49 192 / 0.35)',
      },
      backdropBlur: { xs: '2px' },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-in-right': {
          '0%': { transform: 'translateX(16px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.25s ease-out',
      },
    },
  },
  plugins: [],
}
