/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans Arabic"', 'Tahoma', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { 50: '#eef5fd', 100: '#cce3fd', 200: '#9dc8f7', 400: '#338ced', 500: '#257de0', 600: '#1b64be', 700: '#0f4a96', 800: '#0e3d7e' },
      },
    },
  },
  plugins: [],
}
