/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg)',
        surface:    'var(--surface)',
        border:     'var(--border)',
        'border-dim': 'var(--border-dim)',
        primary:    'var(--text-primary)',
        muted:      'var(--text-muted)',
        purple:     '#7F77DD',
        'purple-dim': 'rgba(127,119,221,0.15)',
        green:      '#1D9E75',
        'green-dim': 'rgba(29,158,117,0.15)',
        red:        '#E24B4A',
        'red-dim':  'rgba(226,75,74,0.15)',
        amber:      '#EF9F27',
      },
      fontFamily: {
        mono: ['"Space Mono"', 'monospace'],
        sans: ['Syne', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
