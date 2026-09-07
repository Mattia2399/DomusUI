/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        apple: {
          black: '#050505',
          dark: '#1C1C1E',
          card: '#2C2C2E',
          gray: '#8E8E93',
          blue: '#0A84FF',
          green: '#32D74B',
          orange: '#FF9F0A',
        },
      },
      boxShadow: {
        'glass-surface': '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
        'glow-blue': '0 0 20px rgba(10, 132, 255, 0.4)',
        'glow-green': '0 0 20px rgba(50, 215, 75, 0.4)',
        'glow-orange': '0 0 25px rgba(255, 159, 10, 0.45)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        body: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        label: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        display: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        headline: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        serif: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
};
