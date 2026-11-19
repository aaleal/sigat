import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname),
  plugins: [vue()],
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    outDir: resolve(__dirname, '../public'),
    emptyOutDir: true,
  },
});
