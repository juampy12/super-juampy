import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'rgb(var(--brand))',
          600: 'rgb(var(--brand-600))',
          700: 'rgb(var(--brand-700))',
          fg: 'rgb(var(--brand-fg))',
        },
      },
      borderRadius: { '2xl': '1rem' },
    },
  },
  plugins: [],
}
export default config

