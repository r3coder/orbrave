// The admin page (server/admin/): served by the preset server itself at /admin/, not part of the
// site build, so it never goes up to GitHub Pages. It sits on the same origin as /api, which is
// why the admin API needs no CORS at all. Behind Nginx it is /orbrave/admin/ next to /orbrave/api/.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DIR = new URL('./admin/', import.meta.url);
const FILES = {
  '': ['index.html', 'text/html; charset=utf-8'],
  'index.html': ['index.html', 'text/html; charset=utf-8'],
  'admin.js': ['admin.js', 'text/javascript; charset=utf-8'],
  'admin.css': ['admin.css', 'text/css; charset=utf-8'],
};
const HEADERS = {
  'Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
};

// `path` is the request path after the mount point, e.g. "", "/", "/admin.js".
// Returns false when it isn't one of the page's files (the caller answers 404).
export async function serveAdminPage(req, res, path) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return true;
  }
  // /admin -> /admin/ (relative, so it also works under Nginx's /orbrave/ prefix)
  if (path === '') {
    res.writeHead(301, { Location: 'admin/' }).end();
    return true;
  }
  const f = FILES[path.replace(/^\//, '')];
  if (!f) return false;
  const body = await readFile(fileURLToPath(new URL(f[0], DIR)));
  res.writeHead(200, { ...HEADERS, 'Content-Type': f[1], 'Content-Length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}
