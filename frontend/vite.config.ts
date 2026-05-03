import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  preview: {
    // Vite 6 rejects non-local Host headers unless listed here (e.g. *.onrender.com).
    allowedHosts: true,
  },
})
