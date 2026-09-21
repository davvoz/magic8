/**
 * Minimal static file server for local development.
 *
 * ES modules and fetch() of JSON content do not work from file:// URLs, so a
 * server is required. This one has no dependencies, never lists directories,
 * and refuses any path that resolves outside the project root.
 *
 * Usage: node tools/dev-server.js [port]
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_PORT = 8080;
const MAX_URL_LENGTH = 2048;

const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
});

/**
 * Resolves a request URL to an absolute file path inside ROOT, or null when
 * the path is malformed or escapes the root.
 * @param {string} rawUrl
 * @returns {string | null}
 */
function resolveRequestPath(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.length > MAX_URL_LENGTH) {
    return null;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, "http://localhost").pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0")) {
    return null;
  }
  const target = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const absolute = normalize(join(ROOT, target));
  const rootWithSep = ROOT.endsWith(sep) ? ROOT : ROOT + sep;
  return absolute.startsWith(rootWithSep) ? absolute : null;
}

function sendStatus(response, status, text) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

async function handleRequest(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendStatus(response, 405, "Method Not Allowed");
    return;
  }
  const filePath = resolveRequestPath(request.url ?? "/");
  if (filePath === null) {
    sendStatus(response, 400, "Bad Request");
    return;
  }
  let info;
  try {
    info = await stat(filePath);
  } catch {
    sendStatus(response, 404, "Not Found");
    return;
  }
  if (!info.isFile()) {
    sendStatus(response, 404, "Not Found");
    return;
  }
  const contentType = MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": info.size,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

const port = Number.parseInt(process.argv[2] ?? "", 10) || DEFAULT_PORT;
createServer((request, response) => {
  handleRequest(request, response).catch(() => sendStatus(response, 500, "Internal Server Error"));
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Serving ${ROOT} at http://127.0.0.1:${port}/\n`);
});
