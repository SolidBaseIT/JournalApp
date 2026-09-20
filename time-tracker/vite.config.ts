import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built app works from any subpath (GitHub Pages, Netlify, a folder on a server).
export default defineConfig({
  base: './',
  plugins: [react()],
});
