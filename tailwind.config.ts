import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        body: ['var(--font-body)', 'sans-serif'],
        display: ['var(--font-display)', 'serif'],
      },
      colors: {
        // Paleta quente inspirada em jim-pam.cordially.io:
        // fundo #fcf7ed, texto #2f241b, apoio #76614d, destaque #8a5a2b e #e7c88a.
        cream: '#fcf7ed',
        parchment: '#f6edd7',
        // Substitui o cinza padrão do Tailwind por neutros marrons, já que o site usa zinc nos textos.
        zinc: {
          50: '#fbf7f0',
          100: '#f4ede2',
          200: '#e7ddce',
          300: '#d2c4b1',
          400: '#ab9883',
          500: '#8e7863',
          600: '#76614d',
          700: '#4e3e30',
          800: '#2f241b',
          900: '#221a13',
          950: '#16100b',
        },
        teaRose: {
          50: '#fdf8f1',
          100: '#f8ecdc',
          200: '#f0d9bc',
          300: '#e4bf96',
          400: '#d09f6f',
          500: '#b8814f',
          600: '#9a663b',
          700: '#7a4f2d',
          800: '#5b3a21',
          900: '#3d2716',
        },
        lavender: {
          50: '#faf8fe',
          100: '#f2eeff',
          200: '#e3d9ff',
          300: '#cfbcff',
          400: '#b798ff',
          500: '#9d72f3',
          600: '#7f55cf',
          700: '#6342a4',
          800: '#493078',
          900: '#311f50',
        },
        olive: {
          50: '#f5f7f1',
          100: '#e8eedf',
          200: '#d3dfc1',
          300: '#b7ca99',
          400: '#96ae70',
          500: '#789051',
          600: '#617541',
          700: '#4b5b33',
          800: '#374326',
          900: '#252e19',
        },
        champagne: {
          50: '#fffaf1',
          100: '#f6edd7',
          200: '#efdcb2',
          300: '#e7c88a',
          400: '#cda266',
          500: '#ad7d47',
          600: '#8a5a2b',
          700: '#704822',
          800: '#56371a',
          900: '#3b2612',
        },
      },
      boxShadow: {
        luxury: '0 18px 50px rgba(92, 70, 34, 0.16)',
        floral: '0 12px 40px rgba(92, 70, 34, 0.14)',
      },
      backdropBlur: {
        '3xl': '40px',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.2s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
