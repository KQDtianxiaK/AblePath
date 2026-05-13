import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export function serveStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  rootDir: string,
  extraHeaders: http.OutgoingHttpHeaders = {},
): boolean {
  if (req.method !== 'GET' || !fs.existsSync(rootDir)) return false;

  const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
  if (urlPath.startsWith('/api') || urlPath.startsWith('/ws')) return false;

  const normalized = urlPath === '/' ? '/index.html' : urlPath;
  let filePath = path.resolve(rootDir, `.${normalized}`);
  if (!filePath.startsWith(path.resolve(rootDir))) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.resolve(rootDir, 'index.html');
  }
  if (!fs.existsSync(filePath)) return false;

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream', ...extraHeaders });
  fs.createReadStream(filePath).pipe(res);
  return true;
}
