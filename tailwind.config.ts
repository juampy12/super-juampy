import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#E53935', foreground: '#ffffff' },   // rojo
        secondary: { DEFAULT: '#2E7D32', foreground: '#ffffff' }, // verde
        accent: { DEFAULT: '#FDD835', foreground: '#111827' },    // amarillo
      },
      boxShadow: {
        card: '0 8px 30px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
}

export default config
