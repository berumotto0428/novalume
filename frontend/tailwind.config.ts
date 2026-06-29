import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#dce1ff',
          200: '#c7ceff',
          300: '#a5b0fc',
          400: '#7c8cf7',
          500: '#4f6ef7',
          600: '#3b5de7',
          700: '#2d4ad6',
          800: '#171775',   // Logo Nova 深靛蓝
          900: '#15207a',
        },
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      boxShadow: {
        'card':    '0 1px 3px 0 rgb(79 110 247 / 0.06), 0 1px 2px -1px rgb(79 110 247 / 0.06)',
        'elevated':'0 4px 12px 0 rgb(79 110 247 / 0.08), 0 2px 4px -1px rgb(79 110 247 / 0.04)',
        'dialog':  '0 20px 60px 0 rgb(79 110 247 / 0.12), 0 8px 20px -4px rgb(79 110 247 / 0.06)',
      },
    },
  },
  plugins: [typography],
}

export default config
