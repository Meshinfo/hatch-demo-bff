# hatch-demo-bff

Hatch 上的 **OpenAI 兼容聊天包装器**。页面填 `base_url` 和 API key，选模型后对话。浏览器只打这台服务；服务再去调上游。密钥不写盘、不进日志。

Coolify 按 `Dockerfile` 构建并跑一个进程。Hatch 只发分享链接和访客身份。

## 能做什么

- `/` — 聊天页：预设常见兼容网关，拉取 `/v1/models`，流式对话
- `GET /healthz` — Coolify / Hatch 探活
- `GET /api/whoami` — 回显 Hatch 身份头
- `POST /api/models` — `{ baseUrl, apiKey }` → 上游模型列表
- `POST /api/chat` — `{ baseUrl, apiKey, model, messages, stream }` → 转发 `/v1/chat/completions`

兼容把聊天接口做成 OpenAI 形状的服务，例如 OpenAI、DeepSeek、Groq、OpenRouter、SiliconFlow。Azure OpenAI 路径不同，这个 demo 不覆盖。

`baseUrl` 写成根或带 `/v1` 都可以。内网、本机、链路本地地址会被拒绝，避免 SSRF。

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
