import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** The strict Content-Security-Policy is applied to production builds only: Vite's dev server needs inline scripts for hot reload. */
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://server.arcgisonline.com; font-src 'self'; media-src 'self' blob:; connect-src 'self' blob: data: https: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'";
const csp = (): Plugin => ({
  name: 'beyond-earth-csp',
  apply: 'build',
  transformIndexHtml: html => html.replace('<!--csp-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n  <meta http-equiv="X-Content-Type-Options" content="nosniff">`),
});

export default defineConfig({
  plugins: [react(), csp()],
  build: { chunkSizeWarningLimit: 1600 },
});
