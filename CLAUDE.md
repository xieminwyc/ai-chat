# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

AI Chat App — a full-stack AI chat application with streaming responses, built with Next.js 16 App Router, Prisma 7, PostgreSQL, and the OpenAI SDK pointed at SiliconFlow's API. Documentation is in Chinese.

## Commands

| Task | Command |
|------|---------|
| Dev (local) | `npm run dev` |
| Dev (test env) | `npm run dev:test` |
| Dev (prod env) | `npm run dev:pro` |
| Build | `npm run build` |
| Start | `npm start` |
| Lint | `npm run lint` |
| Test (all) | `npm run test` |
| Test (single file) | `npx vitest run src/path/to/file.test.ts` |
| Test (watch) | `npx vitest src/path/to/file.test.ts` |
| Prisma generate | `npm run prisma:generate` |
| Prisma migrate | `npm run prisma:migrate:deploy` |

Environment switching uses `APP_ENV` via `scripts/env.mjs`, which loads the corresponding `.env.*` file. Append `:test` or `:pro` to prisma scripts for other environments.

## Architecture

```
src/
  app/
    api/chat/route.ts       # Single API route handling POST/GET/PATCH/DELETE via query params
    layout.tsx               # Root layout
    page.tsx                 # Renders ChatApp
  components/
    chat-app.tsx             # Main client component — all UI state lives here (React hooks, no state library)
  server/
    chat/
      chat-service.ts        # Business logic orchestration
      chat-repository.ts     # Prisma data access
      chat-stream.ts         # ReadableStream builder for streaming AI responses
      chat-logger.ts         # Structured console logging: logInfo(), logError(), getDurationMs()
    ai/
      chat-provider.ts       # OpenAI SDK configured for SiliconFlow endpoint
  lib/
    prisma.ts                # Prisma client singleton (cached on globalThis in dev)
    browser-id.ts            # Client-side UUID generation for optimistic updates
```

### Key Patterns

- **Streaming**: Backend uses async generator → `ReadableStream` with `TextEncoder`. Frontend reads via `response.body.getReader()`. New chat IDs passed via `X-Chat-Id` response header.
- **API design**: Single `/api/chat` route. `chatId` passed as query param. All CRUD in one file.
- **Database**: PostgreSQL with Prisma 7 driver adapter (`@prisma/adapter-pg`). `updatedAt` maintained by DB trigger, not Prisma.
- **No auth**: Single-user app with browser-local `activeChatId` persistence via localStorage.
- **Path alias**: `@/*` maps to `./src/*`.

### Data Models (Prisma)

- `Chat` → has many `Message` (cascade delete)
- `Message` — role enum: `user` | `assistant`, indexed on `[chatId, createdAt]`

## Environment Variables

Required in `.env.*` files:
- `DATABASE_URL` — PostgreSQL connection string
- `SILICONFLOW_API_KEY` — AI provider key
- `SILICONFLOW_BASE_URL` — AI provider endpoint
- `SILICONFLOW_MODEL` — model identifier (e.g. `Qwen/Qwen2.5-7B-Instruct`)

## Testing

Vitest with jsdom environment. Tests are colocated as `*.test.ts` / `*.test.tsx` next to source files. Uses `@testing-library/react` for component tests.

## Deployment

Self-hosted on Aliyun: Nginx (port 80) → Next.js via PM2 (port 3000) → PostgreSQL. CI builds artifact, CD deploys via SSH + `scripts/deploy.sh`. GitHub Secrets hold server credentials.
