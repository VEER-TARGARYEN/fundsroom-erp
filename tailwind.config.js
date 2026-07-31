/** @type {import('tailwindcss').Config} */
// Aetheric Enterprise design system (ported from the Stitch export).
// "Quiet luxury": monochromatic surfaces + one reserved accent, Geist +
// JetBrains Mono, Material-You semantic tokens.
//
// Every color below resolves through a CSS custom property rather than a
// literal hex value, so a theme can be swapped at runtime by changing which
// `--color-*` values are in scope (see src/theme.css) — nothing here needs a
// rebuild. `withOpacity` preserves Tailwind's `/NN` opacity-modifier syntax
// (e.g. `bg-error/15`, used throughout the app for translucent chip fills),
// which breaks if a color is given as a plain `var(--x)` string instead of
// this `rgb(var(--x) / <alpha-value>)` function form.
function withOpacity(variable) {
  return `rgb(var(${variable}) / <alpha-value>)`
}

const TOKENS = [
  'background', 'surface', 'surface-dim', 'surface-bright',
  'surface-container-lowest', 'surface-container-low', 'surface-container',
  'surface-container-high', 'surface-container-highest',
  'on-background', 'on-surface', 'on-surface-variant',
  'outline', 'outline-variant',
  'primary', 'on-primary', 'primary-container', 'primary-fixed-dim',
  'secondary', 'on-secondary', 'secondary-container', 'on-secondary-container', 'secondary-fixed',
  'success', 'success-container',
  'warning', 'warning-container',
  'error', 'on-error', 'error-container', 'on-error-container',
]

const colors = Object.fromEntries(TOKENS.map((t) => [t, withOpacity(`--color-${t}`)]))

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors,
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
        // Was hardcoded to the Nexus indigo (49 49 192) regardless of theme —
        // now tracks whichever theme's secondary-container is active.
        glow: '0 0 0 1px rgb(var(--color-secondary-container) / 0.30), 0 8px 24px -8px rgb(var(--color-secondary-container) / 0.35)',
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
