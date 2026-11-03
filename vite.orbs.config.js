import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';

// Same project, but `/` serves the orb page (orbs.html) instead of the infinite player.
// Run with: npx vite --config vite.orbs.config.js --port 5174
function orbsAsIndex() {
  return {
    name: 'orbs-as-index',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url.startsWith('/?')) req.url = '/orbs.html';
        next();
      });
    },
  };
}

export default mergeConfig(base, defineConfig({ plugins: [orbsAsIndex()] }));
