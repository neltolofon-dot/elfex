import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relative : le build marche à la racine d'un domaine comme dans un sous-dossier
// (GitHub Pages, Netlify, Vercel…).
export default defineConfig({
  base: './',
  plugins: [react()],
})
