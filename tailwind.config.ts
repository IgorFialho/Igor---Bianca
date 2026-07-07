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
        body: ['var(--font-manrope)', 'sans-serif'],
        display: ['var(--font-cormorant)', 'serif'],
      },
      colors: {
        cream: '#f8f3ea',
        parchment: '#f5eee2',
        teaRose: {
          50: '#fef5f7',
          100: '#fdebf0',
          200: '#f9d2dd',
          300: '#f2b3c8',
          400: '#e68ea9',
          500: '#d66d8b',
          600: '#ba4f70',
          700: '#933a57',
          800: '#6c2940',
          900: '#471a2a',
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
          50: '#fffaf4',
          100: '#fff1dc',
          200: '#f7d9a9',
          300: '#e8c07d',
          400: '#d8af5c',
          500: '#c79c42',
          600: '#a97b2f',
          700: '#815c22',
          800: '#5b4018',
          900: '#38270f',
        },
      },
      boxShadow: {
        luxury: '0 18px 50px rgba(92, 70, 34, 0.16)',
        floral: '0 12px 40px rgba(148, 114, 132, 0.18)',
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
