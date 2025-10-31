/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      colors: {
        'h4ks-dark': {
          900: '#0f1618',
          800: '#1a2325',
          700: '#253033',
          600: '#2f3a3d',
        },
        'h4ks-green': {
          DEFAULT: '#00ff41',
          50: '#e6fff0',
          100: '#b3ffd4',
          200: '#80ffb8',
          300: '#4dff9c',
          400: '#1aff7f',
          500: '#00ff41',
          600: '#00cc34',
          700: '#009926',
          800: '#006619',
          900: '#00330c',
        },
      },
    },
  },
  plugins: [],
}
