import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { presetDevApi } from './tools/presetDevApi.js';

// superdough keeps a global pool of reusable audio nodes (filters, compressors, supersaw
// and wavetable worklets) that is not keyed by AudioContext. After an offline render,
// nodes from that finished context get handed out again for the next render (or the live
// player), fail to connect, and the voice silently drops out. Patch the pool's liveness
// check so a pooled node is only reused inside the context it was created in.
function superdoughPoolContextFix() {
  const needle = 'if (!(e instanceof AudioWorkletNode)) return !0;';
  return {
    name: 'superdough-pool-context-fix',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').includes('@strudel/web/dist/index.mjs')) return;
      const getCtx = /(\w+) as getAudioContext\b/.exec(code)?.[1];
      if (!getCtx || !code.includes(needle)) {
        throw new Error('superdough-pool-context-fix: pattern not found, check the @strudel/web version');
      }
      return code.replace(needle, `if (e.context !== ${getCtx}()) return !1;\n  ${needle}`);
    },
  };
}

export default defineConfig({
  // relative asset paths so dist/ works from any sub-path on the target server
  base: './',
  // presetDevApi: /api/presets during `npm run dev`, the same handler the production server uses
  plugins: [superdoughPoolContextFix(), presetDevApi()],
  // serve @strudel/web untouched by the dependency pre-bundler so the patch above applies in dev too
  optimizeDeps: { exclude: ['@strudel/web'] },
  // the Python analyzer's venv and audio/stem cache are large and never part of the site
  server: { watch: { ignored: ['**/tools/analyze/.venv/**', '**/analysis/**', '**/.preset-data/**', '**/server/data/**'] } },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        nightShift: resolve(import.meta.dirname, 'night-shift.html'),
        orbs: resolve(import.meta.dirname, 'orbs.html'),
        render: resolve(import.meta.dirname, 'render.html'),
        orbs: resolve(import.meta.dirname, 'orbs.html'),
      },
    },
  },
});
