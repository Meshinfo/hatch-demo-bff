const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, "public");
const MAX_BODY = 1_000_000;
const MODELS_MS = 15_000;
const CHAT_MS = 120_000;
const USER_RE = /^[A-Za-z0-9_:-]{1,80}$/;

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
    user: hatchUser(req),
    authMode: req.headers["x-hatch-auth-mode"] || null,
    projectId: req.headers["x-hatch-project-id"] || null,
    hasIdentityJwt: Boolean(req.headers["x-hatch-identity"]),
  };
}

function hatchUser(req) {
  const id = String(req.headers["x-hatch-user"] || "").trim();
  return USER_RE.test(id) ? id : null;
}

function storeDir() {
  const candidates = [
    process.env.RELAY_STORE_DIR,
    "/data/relay",
    path.join(__dirname, "data"),
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch {
      // try next
    }
  }
  const fallback = path.join(__dirname, "data");
  fs.mkdirSync(fallback, { recursive: true, mode: 0o700 });
  return fallback;
}

function storeKey() {
  const fromEnv = process.env.RELAY_STORE_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    return crypto.createHash("sha256").update(fromEnv).digest();
  }
  const file = path.join(storeDir(), ".secret");
  try {
    const raw = fs.readFileSync(file, "utf8").trim();
    if (raw) return Buffer.from(raw, "base64");
  } catch {
    // create
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(file, key.toString("base64"), { mode: 0o600 });
  return key;
}

function seal(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", storeKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

function openSealed(packed) {
  const buf = Buffer.from(String(packed || ""), "base64");
  if (buf.length < 29) return "";
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", storeKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

function storePath() {
  return path.join(storeDir(), "settings.json");
}

function readStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    return raw && typeof raw === "object" && raw.users && typeof raw.users === "object"
      ? raw
      : { users: {} };
  } catch {
    return { users: {} };
  }
}

function writeStore(data) {
  const tmp = storePath() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ users: data.users || {} }), { mode: 0o600 });
  fs.renameSync(tmp, storePath());
}

function publicSettings(user) {
  if (!user) {
    return { user: null, canPersist: false, hasKey: false, baseUrl: "", model: "" };
  }
  const row = readStore().users[user];
  return {
    user,
    canPersist: true,
    hasKey: Boolean(row?.apiKeyCipher),
    baseUrl: row?.baseUrl || "",
    model: row?.model || "",
  };
}

function storedSecret(user) {
  if (!user) return null;
  const row = readStore().users[user];
  if (!row?.apiKeyCipher) return null;
  try {
    const apiKey = openSealed(row.apiKeyCipher);
    if (!apiKey) return null;
    return { baseUrl: row.baseUrl || "", model: row.model || "", apiKey };
  } catch {
    return null;
  }
}

function isBlockedHost(hostname) {
  const h = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "127.0.0.1" || h === "0.0.0.0" || h === "::1" || h === "::") return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal") return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  return false;
}

function openaiRoot(raw) {
  let target;
  try {
    target = new URL(String(raw || "").trim());
  } catch {
    return { error: "invalid_url" };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return { error: "only_http_https" };
  }
  if (isBlockedHost(target.hostname)) {
    return { error: "blocked_host" };
  }
  let pathname = target.pathname.replace(/\/+$/, "") || "";
  if (!pathname.endsWith("/v1")) pathname += "/v1";
  return { root: `${target.origin}${pathname}` };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > MAX_BODY) {
        reject(Object.assign(new Error("too_large"), { code: "too_large" }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function publicError(err) {
  const text = err instanceof Error ? err.message : String(err);
  if (/aborted|timeout|Timeout/i.test(text)) return "upstream_timeout";
  return "upstream_failed";
}

function upstreamHeaders(apiKey) {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    accept: "application/json",
    "user-agent": "hatch-demo-bff",
    "http-referer": "https://hatch.demo",
    "x-title": "Hatch LLM Relay",
  };
}

async function parseJsonBody(req) {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("invalid_json");
    err.code = "invalid_json";
    throw err;
  }
}

function resolveCreds(req, body) {
  const saved = storedSecret(hatchUser(req));
  const baseUrl = String(body.baseUrl || saved?.baseUrl || "").trim();
  const apiKey = String(body.apiKey || saved?.apiKey || "").trim();
  const parsed = openaiRoot(baseUrl);
  if (parsed.error) return parsed;
  if (!apiKey) return { error: "api_key_required" };
  return { root: parsed.root, apiKey, model: String(body.model || saved?.model || "").trim() };
}

async function handleSettings(req, res) {
  const user = hatchUser(req);
  if (req.method === "GET") {
    return send(res, 200, publicSettings(user));
  }
  if (!user) {
    return send(res, 401, { error: "login_required" });
  }
  if (req.method === "DELETE") {
    const data = readStore();
    delete data.users[user];
    writeStore(data);
    return send(res, 200, publicSettings(user));
  }
  if (req.method !== "PUT") {
    return send(res, 405, { error: "method_not_allowed" });
  }
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    return send(res, 400, { error: err.code || "invalid_json" });
  }
  const incomingKey = String(body.apiKey || "").trim();
  const saved = storedSecret(user);
  const apiKey = incomingKey || saved?.apiKey || "";
  const baseUrl = String(body.baseUrl || saved?.baseUrl || "").trim();
  const model = String(body.model || saved?.model || "").trim();
  const parsed = openaiRoot(baseUrl);
  if (parsed.error) return send(res, 400, { error: parsed.error });
  if (!apiKey) return send(res, 400, { error: "api_key_required" });
  const data = readStore();
  data.users[user] = {
    baseUrl,
    model,
    apiKeyCipher: seal(apiKey),
    updatedAt: new Date().toISOString(),
  };
  writeStore(data);
  return send(res, 200, publicSettings(user));
}

async function handleModels(req, res) {
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    return send(res, 400, { error: err.code || "invalid_json" });
  }
  const creds = resolveCreds(req, body);
  if (creds.error) return send(res, 400, { error: creds.error });
  try {
    const upstream = await fetch(`${creds.root}/models`, {
      method: "GET",
      headers: upstreamHeaders(creds.apiKey),
      signal: AbortSignal.timeout(MODELS_MS),
    });
    const text = await upstream.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!upstream.ok) {
      return send(res, 502, {
        error: "upstream_http",
        status: upstream.status,
        message: (json && (json.error?.message || json.message)) || "models_failed",
      });
    }
    const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    const models = rows
      .map((row) => (typeof row === "string" ? row : row?.id))
      .filter((id) => typeof id === "string" && id.trim())
      .slice(0, 200);
    return send(res, 200, { models });
  } catch (err) {
    return send(res, 502, { error: publicError(err) });
  }
}

async function handleChat(req, res) {
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    return send(res, 400, { error: err.code || "invalid_json" });
  }
  const creds = resolveCreds(req, body);
  if (creds.error) return send(res, 400, { error: creds.error });
  const model = String(body.model || creds.model || "").trim();
  if (!model) return send(res, 400, { error: "model_required" });
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return send(res, 400, { error: "messages_required" });
  }
  const messages = body.messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant" || m.role === "system"))
    .map((m) => ({ role: m.role, content: String(m.content || "").slice(0, 32_000) }))
    .slice(-40);
  const stream = body.stream !== false;

  let upstream;
  try {
    upstream = await fetch(`${creds.root}/chat/completions`, {
      method: "POST",
      headers: upstreamHeaders(creds.apiKey),
      body: JSON.stringify({
        model,
        messages,
        stream,
        temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
      }),
      signal: AbortSignal.timeout(CHAT_MS),
    });
  } catch (err) {
    return send(res, 502, { error: publicError(err) });
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    let message = "chat_failed";
    try {
      const json = JSON.parse(text);
      message = json.error?.message || json.message || message;
    } catch {
      if (text) message = text.slice(0, 400);
    }
    return send(res, 502, { error: "upstream_http", status: upstream.status, message });
  }

  if (!stream) {
    const json = await upstream.json();
    return send(res, 200, json);
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const reader = upstream.body?.getReader?.();
  if (!reader) {
    res.end();
    return;
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } catch {
    // client or upstream closed
  } finally {
    res.end();
  }
}

const INDEX = path.join(PUBLIC, "index.html");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/healthz") {
    return send(res, 200, "ok\n");
  }
  if (req.method === "GET" && url.pathname === "/api/whoami") {
    return send(res, 200, whoami(req));
  }
  if (url.pathname === "/api/settings") {
    return handleSettings(req, res);
  }
  if (req.method === "POST" && url.pathname === "/api/models") {
    return handleModels(req, res);
  }
  if (req.method === "POST" && url.pathname === "/api/chat") {
    return handleChat(req, res);
  }
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(INDEX));
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found\n");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`hatch-demo-bff on 0.0.0.0:${PORT}`);
});
