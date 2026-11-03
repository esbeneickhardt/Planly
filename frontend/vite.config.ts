import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const vendorChunks: Record<string, string[]> = {
  'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
  'vendor-reactflow': ['reactflow', '@reactflow'],
  'vendor-dnd':      ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
  'vendor-misc':     ['react-markdown', 'remark-gfm', 'remark-breaks', 'rehype-highlight'],
};

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    cssCodeSplit: true,
    rolldownOptions: {
      output: {
        // Rolldown (Vite 8) only takes the function form of manualChunks.
        manualChunks(id) {
          const [chunk] =
            Object.entries(vendorChunks).find(([, pkgs]) =>
              pkgs.some((pkg) => id.includes(`/node_modules/${pkg}/`)),
            ) ?? [];
          return chunk;
        },
      },
    },
  },
});
