/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/renderer/**/*.html',
    './src/renderer/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#E0C45D',
          hover: '#C2A532',
          text: '#8A6F0E',
          bg: '#FEF9E7'
        },
        graphite: {
          dark: '#2B2B2B',
          mid: '#4A4A4A',
          light: '#A6A6A5'
        },
        excel: {
          header: '#E5E7EB',
          text: '#1F2937',
          border: '#D1D5DB'
        }
      }
    }
  },
  plugins: []
};

