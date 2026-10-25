# hatch-demo-bff

Hatch 上的 **OpenAI 兼容聊天包装器**。页面填 `base_url` 和 API key，选模型后对话。浏览器只打这台服务；服务再去调上游。

登录用户可以点「记住密钥」：按 `X-Hatch-User` 加密写在这台应用里，接口不回明文。下次用同一个 Hatch 账号进来会自动带上。未登录则只留在这台浏览器。点「忘记」会删掉。

Coolify 按 `Dockerfile` 构建并跑一个进程。Hatch 只发分享链接和访客身份。

## 能做什么

- `/` — 聊天页：预设常见兼容网关，拉取 `/v1/models`，流式对话
- `GET /healthz` — Coolify / Hatch 探活
- `GET /api/whoami` — 回显 Hatch 身份头
- `GET|PUT|DELETE /api/settings` — 按登录用户读写加密后的网关/密钥（GET 只回 `hasKey`）
- `POST /api/models` — `{ baseUrl, apiKey? }` → 上游模型列表；已保存则可省略 key
- `POST /api/chat` — `{ baseUrl, apiKey?, model, messages, stream }` → 转发 `/v1/chat/completions`

兼容把聊天接口做成 OpenAI 形状的服务，例如 OpenAI、DeepSeek、Groq、OpenRouter、SiliconFlow。Azure OpenAI 路径不同，这个 demo 不覆盖。

`baseUrl` 写成根或带 `/v1` 都可以。内网、本机、链路本地地址会被拒绝，避免 SSRF。

重新发布会换容器，服务端存的密钥会丢，浏览器里那份还在。要跨发布保留，给容器挂 `RELAY_STORE_DIR`（默认 `/data/relay`）。

## 本地跑

```bash
npm start
# http://127.0.0.1:3000
```

## 从 Hatch 发布

Origin 必须是 Coolify。仓库必须是公开的 `https://github.com/owner/repo`。

```bash
curl -X PUT "$HATCH/api/v1/projects/$PROJECT_ID/source" \
  -H "Authorization: Bearer $HATCH_TOKEN" -H "Content-Type: application/json" \
  -d '{"repository":"https://github.com/Meshinfo/hatch-demo-bff","branch":"main"}'

curl -X POST "$HATCH/api/v1/deploy" \
  -H "Authorization: Bearer $HATCH_TOKEN" -H "Content-Type: application/json" \
  -d "{\"source\":\"git\",\"projectId\":\"$PROJECT_ID\"}"
```

打开 Hatch 的分享链接（开了 Edge 时不要用 Coolify 主机名）。
