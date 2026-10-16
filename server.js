// Zero-install local server: `node server.js`, then open http://localhost:3000
// Serves the static page and runs the same api/*.js handlers that Vercel would.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
process.chdir(ROOT); // lib/store.js finds data/ from the working folder, as on Vercel
try {
  process.loadEnvFile('.env.local'); // GROQ_API_KEY for photo identification and the assistant
} catch {
  console.warn('No .env.local found: photo identification and the assistant need GROQ_API_KEY.');
}
const PORT = Number(process.env.PORT) || 3000;
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg' };
const API = new Set(['products', 'reviews', 'helpful', 'identify', 'ask', 'web-summary']);

// Adds the small parts of Vercel's req/res API that our handlers use.
function vercelShim(req, res, url, body) {
  req.query = Object.fromEntries(url.searchParams);
  req.body = body;
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
    return res;
  };
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4_000_000) throw new Error('Body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      const apiName = url.pathname.match(/^\/api\/([a-z-]+)$/)?.[1];
      if (apiName && API.has(apiName)) {
        const body = req.method === 'POST' ? await readBody(req) : undefined;
        vercelShim(req, res, url, body);
        const { default: handler } = await import(pathToFileURL(path.join(ROOT, 'api', `${apiName}.js`)).href);
        return await handler(req, res);
      }
      // Product photos saved by /api/identify
      const imageId = url.pathname.match(/^\/images\/([a-z0-9-]+)\.jpg$/)?.[1];
      if (imageId) {
        const image = await readFile(path.join(ROOT, 'data', 'images', `${imageId}.jpg`)).catch(() => null);
        if (!image) return res.writeHead(404).end('Not found');
        return res.writeHead(200, { 'Content-Type': TYPES['.jpg'] }).end(image);
      }
      const file = STATIC[url.pathname];
      if (!file) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] });
      res.end(await readFile(path.join(ROOT, file)));
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad request.' }));
    }
  })
  .listen(PORT, () => console.log(`HonestShelf running at http://localhost:${PORT}`));
