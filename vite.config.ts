import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react-dom') || id.includes('react-router-dom') || id.includes('/react/')) {
            return 'react-vendor';
          }
          if (id.includes('firebase')) {
            return 'firebase-vendor';
          }
          if (id.includes('lucide-react')) {
            return 'icons-vendor';
          }
          if (id.includes('xlsx')) {
            return 'xlsx-vendor';
          }
          if (id.includes('jspdf')) {
            return 'jspdf-vendor';
          }
          if (id.includes('html2canvas')) {
            return 'html2canvas-vendor';
          }
          if (id.includes('dompurify')) {
            return 'dompurify-vendor';
          }
        },
      },
    },
  },
})
