import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs so the same build runs on the web, inside Electron
  // (fox-app://) and inside the Android WebView.
  base: './',
  plugins: [react()],
})
