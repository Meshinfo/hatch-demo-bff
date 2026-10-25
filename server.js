const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, "public");

function send(res, status, body, headers) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const type =
    typeof body === "string"
      ? "text/plain; charset=utf-8"
      : "application/json; charset=utf-8";
  res.writeHead(status, { "content-type": type, ...headers });
  res.end(payload);
}

function whoami(req) {
  return {
    user: req.headers["x-hatch-user"] || null,
    authMode: req.headers["x-hatch-auth-mode"] || null,
    projectId: req.headers["x-hatch-project-id"] || null,
    hasIdentityJwt: Boolean(req.headers["x-hatch-identity"]),
  };
}

function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "127.0.0.1" || h === "0.0.0.0" || h === "::1") return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  return false;
}

async function checkUrl(raw) {
  let target;
  try {
    target = new URL(raw);
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return { ok: false, error: "only_http_https" };
  }
  if (isBlockedHost(target.hostname)) {
    return { ok: false, error: "blocked_host" };
  }
  const started = Date.now();
  try {
    const res = await fetch(target.href, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "hatch-demo-bff" },
    });
    return {
      ok: res.ok,
      url: target.href,
      status: res.status,
      ms: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      url: target.href,
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - started,
    };
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/healthz") {
    return send(res, 200, "ok\n");
  }
  if (req.method === "GET" && url.pathname === "/api/whoami") {
    return send(res, 200, whoami(req));
  }
  if (req.method === "GET" && url.pathname === "/api/check") {
    const target = url.searchParams.get("url") || "";
    if (!target) return send(res, 400, { ok: false, error: "url_required" });
    return send(res, 200, await checkUrl(target));
  }
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    const file = path.join(PUBLIC, "index.html");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(file));
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found\n");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`hatch-demo-bff on 0.0.0.0:${PORT}`);
});
