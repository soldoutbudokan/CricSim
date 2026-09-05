import { defineConfig } from 'vite';

// The shipped game remains plain static files; Vite provides local development.
export default defineConfig({
  root: 'dist',
  server: { host: '0.0.0.0', allowedHosts: ['terminal.local'] },
});
