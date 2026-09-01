# Nexus Crew V2 — Multi-Agent AI OS

Production-oriented multi-agent pipeline with SSE streaming, server-side approvals, artifacts, and modular providers.

## Pipeline

```
Orchestrator → Planner → Researcher → Analyst → Architect
→ Builder → Designer → Coder → Tester → Security → Reviewer → Documenter
```

## Quick start (your machine / Termux)

```bash
cd nexus-crew
npm install
cp .env.example .env.local
# Set LLM_API_KEY and LLM_PROVIDER in .env.local
npm run typecheck
npm run build
npm run dev
```

Open http://localhost:3000

### Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_API_KEY` | Yes (for live) | Or OPENAI_API_KEY / XAI_API_KEY / OPENROUTER_API_KEY |
| `LLM_PROVIDER` | No | `openai` (default) \| `xai` \| `openrouter` \| `custom` |
| `LLM_MODEL` | No | Model override |
| `LLM_FAST_MODEL` | No | Cheaper model for light agents |
| `TOOL_ALLOW_WEB` | No | `true` to enable web search tool |
| `TOOL_ALLOW_FILE_WRITE` | No | `true` to enable sandbox file write |
| `TOOL_ALLOW_URL_READ` | No | `true` to enable URL reader |
| `STORAGE_PROVIDER` | No | `file` \| `memory` (auto on Vercel) |

## API

- `POST /api/mission` — `{ "mission": "...", "stream": true }`
- `GET /api/mission` — list missions
- `GET /api/mission/[id]`
- `POST /api/mission/[id]/approve`
- `POST /api/mission/[id]/reject`
- `POST /api/mission/[id]/cancel`

## Core verification (no Next required)

```bash
node scripts/verify-core.mjs
```

## Stack

- Next.js 14 + React 18 + TypeScript + Tailwind 3
- OpenAI-compatible LLM provider
- File / memory storage abstraction
- SSE live mission updates

## Free AI Router (Termux)

Nexus Crew talks to your local Free AI Router **server-side only**.

```env
AI_ROUTER_URL=http://127.0.0.1:3000
# optional if router is exposed beyond localhost:
# AI_ROUTER_SECRET=shared-secret
```

**Port note:** Router and Nexus both default to 3000. Run them on different ports:

```bash
# Terminal 1 — Free AI Router (example)
cd ~/free-ai-router   # your router folder
# start router on 3000 (your existing start command)

# Terminal 2 — Nexus Crew
cd ~/nexus-crew
cp .env.example .env.local
# ensure AI_ROUTER_URL=http://127.0.0.1:3000
npm run dev -- -p 3001
# open http://127.0.0.1:3001
```

Status: header badge **AI Router: ONLINE/OFFLINE** polls `GET /api/router`.

Vercel / remote: set `AI_ROUTER_URL` to a securely exposed HTTPS URL of the router (not Android localhost).
