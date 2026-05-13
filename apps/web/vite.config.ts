import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:4317',
      '/ws': {
        target: 'ws://localhost:4317',
        ws: true,
      },
    },
  },
});
