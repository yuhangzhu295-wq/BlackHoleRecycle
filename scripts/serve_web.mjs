/**
 * Serve the built Web Mobile player so the game can actually be started.
 *
 * The repo had no start script: every existing runner (`capture_page.mjs`, the
 * acceptance scopes) calls `serve()` from `page_layout_geometry.mjs`, which
 * listens on a random port and maps only html/js/json/css/png/jpg -- `.wasm`
 * falls through to `application/octet-stream`. That is fine for the automated
 * runs, which never need a stable URL, but it is the wrong thing to hand a
 * person: the port changes every time and the engine's wasm arrives with no
 * media type.
 *
 * This serves the same directory on a fixed port with `.wasm` declared properly,
 * so `http://127.0.0.1:8080/` is always the game.
 *
 * Usage: node scripts/serve_web.mjs [--port=8080] [--root=<dir>] [--qa]
 *   --qa appends `?qa=1`, which installs the read-only QA bridge. Not needed to
 *   play; it is what the capture and acceptance scripts navigate to.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const valueOf = (name, fallback) => {
  const hit = args.find((argument) => argument.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const port = Number(valueOf('port', '8080'));
const root = path.resolve(repoRoot, valueOf('root', path.join('cocos', 'build', 'web-mobile')));
const qa = args.includes('--qa');

if (!existsSync(path.join(root, 'index.html'))) {
  console.error(`[serve] no index.html under ${root}`);
  console.error('[serve] build it first:  npm run build:web');
  process.exit(1);
}

// `.wasm` is the one that matters: Cocos streams the engine binary, and a wrong
// media type is the difference between streaming compilation and a fallback.
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.bin': 'application/octet-stream',
};

const server = createServer((request, response) => {
  const requested = new URL(request.url, 'http://127.0.0.1').pathname;
  // Strip any traversal before joining, so a crafted path cannot escape the build.
  const safe = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(root, safe === '/' ? 'index.html' : safe);
  if (!existsSync(filePath)) {
    response.writeHead(404);
    response.end('404');
    return;
  }
  if (statSync(filePath).isDirectory()) {
    const index = path.join(filePath, 'index.html');
    if (!existsSync(index)) {
      response.writeHead(404);
      response.end('404');
      return;
    }
    filePath = index;
  }
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    // The QA bridge and the region bundles are fetched from the page, so keep
    // them out of the browser cache while iterating.
    'Cache-Control': 'no-store',
  });
  response.end(readFileSync(filePath));
});

server.listen(port, '127.0.0.1', () => {
  const suffix = qa ? '?qa=1' : '';
  console.log(`[serve] ${root}`);
  console.log(`[serve] open  http://127.0.0.1:${port}/${suffix}`);
  console.log('[serve] Ctrl+C to stop');
});
