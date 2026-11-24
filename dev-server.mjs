// 로컬 확인용 서버: 정적 파일 + api/*.js (Vercel과 같은 POST(request) 형식). 설치할 것 없음.
// 실행: node dev-server.mjs  →  http://localhost:8080
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL(".", import.meta.url).pathname;
for (const line of (await readFile(join(root, ".env.local"), "utf8").catch(() => "")).split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] ??= m[2];
}
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".sql": "text/plain; charset=utf-8" };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    const api = /^\/api\/([a-z-]+)$/.exec(url.pathname);
    if (api) {
      const mod = await import(`${join(root, "api", api[1])}.js?t=${Date.now()}`).catch(() => null);
      const fn = mod?.[req.method];
      if (!fn) { res.writeHead(404).end(); return; }
      const chunks = []; for await (const c of req) chunks.push(c);
      const out = await fn(new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }));
      res.writeHead(out.status, Object.fromEntries(out.headers)).end(Buffer.from(await out.arrayBuffer()));
      return;
    }
    const path = normalize(url.pathname === "/" ? "/index.html" : url.pathname);
    if (path.includes("..") || /\/\.env|\/api\//.test(path)) { res.writeHead(404).end(); return; }
    const body = await readFile(join(root, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end("not found"); }
}).listen(8080, () => console.log("http://localhost:8080"));
