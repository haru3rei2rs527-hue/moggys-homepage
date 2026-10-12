const fs = require("fs");
const http = require("http");
const path = require("path");
const { publicHandler, adminHandler } = require("./lib/handlers");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function resolveStatic(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (pathname.includes("\0")) return null;
  if (pathname === "/") pathname = "/index.html";
  if (pathname.endsWith("/")) pathname += "index.html";
  if (
    pathname.startsWith("/data/") ||
    pathname.startsWith("/lib/") ||
    pathname.startsWith("/api/") ||
    pathname === "/preview-server.js"
  ) {
    return null;
  }
  const file = path.normalize(path.join(ROOT, pathname));
  if (file !== ROOT && !file.startsWith(`${ROOT}${path.sep}`)) return null;
  return file;
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const file = resolveStatic(url.pathname);
  if (!file) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/reservations") {
    publicHandler(req, res);
    return;
  }
  if (url.pathname === "/api/admin") {
    adminHandler(req, res);
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }
  serveStatic(req, res);
});

if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`http://127.0.0.1:${PORT}/event.html`);
    if (!process.env.EVENT_ADMIN_PASSWORD) {
      console.log("EVENT_ADMIN_PASSWORD is unset. The admin page cannot sign in.");
    }
  });
}

module.exports = { server, resolveStatic };
