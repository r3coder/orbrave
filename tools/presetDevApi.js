// Dev server hook for the preset API: `npm run dev` serves /api/presets with the same handler
// and validation as the production server (server/index.mjs). Shared presets are stored in
// .preset-data/ at the project root, so the orb dev server (5174) and the main one (5173) see
// the same list. Not part of any build.
import { resolve } from 'node:path';
import { createPresetApi } from '../server/presetApi.mjs';
import { serveAdminPage } from '../server/adminPage.mjs';
import { createVocals } from '../server/vocals.mjs';

export function presetDevApi() {
  return {
    name: 'preset-dev-api',
    apply: 'serve',
    configureServer(server) {
      // admin page (admin.html) password in dev: ADMIN_TOKEN, or "dev"
      const api = createPresetApi({ dataDir: resolve(import.meta.dirname, '..', '.preset-data'), adminToken: process.env.ADMIN_TOKEN || 'dev' });
      // the Teto vocal words, from server/vocals as on the production server (server/vocals.mjs)
      const vocals = createVocals({ dir: resolve(import.meta.dirname, '..', 'server', 'vocals') });
      server.middlewares.use('/api', (req, res, next) => vocals(req, res).then((done) => done || api(req, res, next), next));
      // the admin page at /admin/, as the production server serves it
      server.middlewares.use('/admin', (req, res, next) => {
        const path = new URL(req.originalUrl ?? req.url, 'http://local').pathname.slice(6);
        serveAdminPage(req, res, path).then((ok) => ok || next(), next);
      });
    },
  };
}
