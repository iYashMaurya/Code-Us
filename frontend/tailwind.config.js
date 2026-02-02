/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'space-dark': '#050508',
        'cream': '#FFFBEB',
        'brown-dark': '#3E2723',
        'orange': '#ff9933',
      },
      fontFamily: {
        'pixel': ['"Press Start 2P"', 'cursive'],
        'game': ['"VT323"', 'monospace'],
      },
    },
  },
  plugins: [],
}