/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        lagos: {
          yellow: '#FCD116',
          green: '#008751',
          black: '#121212',
          gray: '#F4F5F7'
        }
      }
    },
  },
  plugins: [],
}
