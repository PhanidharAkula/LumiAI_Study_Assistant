import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Base path configuration for production and development
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Generate a _redirects file for Netlify (if you're using it as a backup)
    rollupOptions: {
      output: {
        manualChunks: {
          // Optimize chunk splitting if needed
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // Add other dependencies as needed
        }
      }
    }
  },
  server: {
    port: 5173,
    host: true
  }
})
