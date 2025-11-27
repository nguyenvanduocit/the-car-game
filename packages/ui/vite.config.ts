import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { consoleForwardPlugin } from 'vite-console-forward-plugin';

// Plugin to ensure WASM files are served with correct MIME type
const wasmPlugin = (): Plugin => ({
  name: 'wasm-mime-type',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm');
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [wasmPlugin(), consoleForwardPlugin()],
  server: {
    port: 7000,
    strictPort: true,
    host: true,
    hmr: false, // Disable Hot Module Replacement - manual refresh required
    allowedHosts: ['firegame.firegroup.vn', 'localhost'],
    headers: {
      // Ensure WASM files are served with correct MIME type
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild', // Use esbuild for faster builds (built-in, no extra deps)
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Split BabylonJS into separate chunks for better caching
          if (id.includes('@babylonjs/core')) return 'babylon-core';
          if (id.includes('@babylonjs/gui')) return 'babylon-gui';
          if (id.includes('@babylonjs/havok')) return 'babylon-havok';
          if (id.includes('@babylonjs/materials')) return 'babylon-materials';
          if (id.includes('colyseus.js')) return 'colyseus';
        },
      },
    },
    chunkSizeWarningLimit: 1000, // Increase warning limit for BabylonJS chunks
  },
  optimizeDeps: {
    include: ['@babylonjs/core', '@babylonjs/gui', '@babylonjs/materials', 'colyseus.js'],
    exclude: ['@babylonjs/havok'], // Exclude Havok to prevent WASM bundling issues
  },
  assetsInclude: ['**/*.wasm'],
  worker: {
    format: 'es',
  },
});
