// Runs the same modules as tests/index.html under Node (no browser binary).
// A local static server is the base URL so relative fetch() calls resolve like the page.
// AI-assisted (Claude). Reviewed by the MARS+ team.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.geojson': 'application/geo+json',
  '.css': 'text/css',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gz': 'application/gzip',
  '.md': 'text/markdown; charset=utf-8',
  '.cs': 'text/plain; charset=utf-8',
  '.ps1': 'text/plain; charset=utf-8',
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
      const full = normalize(join(root, rel));
      if (full !== root && !full.startsWith(root.endsWith(sep) ? root : root + sep)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(full);
      res.writeHead(req.method === 'HEAD' ? 200 : 200, {
        'content-type': types[extname(full).toLowerCase()] || 'application/octet-stream',
        'content-length': body.length,
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function element() {
  return { className: '', textContent: '', append() {} };
}

const server = await startServer();
try {
  const port = server.address().port;
  const page = `http://127.0.0.1:${port}/tests/index.html`;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    if (typeof input !== 'string') return nativeFetch(input, init);
    return nativeFetch(new URL(input, page), init);
  };
  globalThis.window = globalThis;
  globalThis.document = { title: '', createElement: element };

  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const specs = [...html.matchAll(/import '\.\/([^']+)'/g)].map((m) => m[1]);
  for (const spec of specs) await import(`./${spec}`);
  const { run } = await import('./harness.js');
  const results = await run(element());
  for (const r of results.results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ` — ${r.error}`}`);
  }
  console.log(`${results.passed}/${results.total} tests passed`);
  if (results.passed !== results.total) process.exitCode = 1;
} finally {
  await new Promise((resolve) => server.close(resolve));
}
