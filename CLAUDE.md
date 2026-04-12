# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

AI Chat App — a full-stack AI chat application with streaming responses, user authentication, and guest access. Built with Next.js 16 App Router, Prisma 7, PostgreSQL, and the OpenAI SDK pointed at SiliconFlow's API. Documentation is in Chinese.

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
| Worker (local) | `npm run worker` |
| Worker (test env) | `npm run worker:test` |
| Worker (prod env) | `npm run worker:pro` |

Environment switching uses `APP_ENV` via `scripts/env.mjs`, which loads the corresponding `.env.*` file. Append `:test` or `:pro` to prisma/worker scripts for other environments.

## Architecture Overview

### Entry State System

The app uses a unified "Entry State" pattern to determine user access level. All pages/auth flows resolve through `entry-state.ts`:

```typescript
type EntryStateKind =
  | "signed_out_guest_preview"     // First visit, no cookies
  | "signed_out_guest_workspace"   // Using guest trial (3 messages)
  | "signed_out_auth_shell"        // Explicitly logged out
  | "authenticated_unverified"     // Registered but email not verified
  | "authenticated_verified";      // Fully authenticated user
```

Pages use `resolveProtectedPageAccess(entryState, "verified" | "authenticated")` to check access and get redirect targets.

### Auth System

**Three-layer architecture:**

```
src/server/auth/
├── auth-repository.ts    // Prisma data access (User, Session, EmailVerificationToken, PasswordResetToken)
├── auth-service.ts       // Business logic (loginUser, registerUser, changePasswordForUser, etc.)
├── auth-errors.ts        // Structured error classes extending AppError
├── auth-schemas.ts       // Zod validation schemas
├── session.ts            // Session token generation, cookie options
├── device-info.ts        // User-Agent parsing (device type, browser, OS)
├── password.ts           // Hashing (bcrypt) and verification
├── email-verification.ts // Email token workflow
└── password-reset.ts     // Forgot password flow
```

**Session management:**
- Cookie stores only opaque `token` (UUID)
- Every request resolves `token` → database → full user
- Sessions track: `deviceInfo` (JSON), `ipAddress`, `lastActiveAt`
- Password changes revoke all other sessions (security feature)
- `GET /api/auth/sessions` lists all active devices
- `DELETE /api/auth/sessions/:id` revokes a specific device

### Guest System

Unauthenticated users get a `GuestSession` with 3 free trial messages:

```
src/server/guest/
├── guest-repository.ts   // GuestSession CRUD, merge into User
├── guest-service.ts      // getOrCreateGuestSession, increment trial count
└── guest-session.ts      // Guest token, cookie names, TTL (7 days)
```

After registration, guest chats can be merged into the user account via `POST /api/guest/merge`.

### Chat System

```
src/server/chat/
├── chat-repository.ts    // Chat/Message CRUD with userId OR guestSessionId (XOR constraint)
├── chat-service.ts       // Business logic, guest→user merge handling
├── chat-stream.ts        // ReadableStream for AI streaming
└── chat-errors.ts        // Domain-specific errors (UnauthorizedError, ForbiddenError)
```

**Streaming:** Backend uses async generator → `ReadableStream` with `TextEncoder`. Frontend reads via `response.body.getReader()`. New chat IDs passed via `X-Chat-Id` response header.

### Error Handling

All domain errors extend `AppError` from `src/server/shared/errors/app-error.ts`:

```typescript
class AuthError extends AppError { ... }
class ChatError extends AppError { ... }
```

Use `toErrorResponse(error, { fallbackMessage })` in route handlers to convert errors to consistent JSON responses.

### Database Models

```
User (id, email, passwordHash, emailVerifiedAt)
  ├─→ Session[] (token, expiresAt, lastActiveAt, deviceInfo, ipAddress)
  ├─→ EmailVerificationToken[] (tokenHash, expiresAt, usedAt)
  ├─→ PasswordResetToken[] (tokenHash, expiresAt, usedAt)
  └─→ Chat[]

GuestSession (guestToken, trialMessageCount, mergedAt, expiresAt)
  └─→ Chat[]

Chat (id, title, userId XOR guestSessionId)
  └─→ Message[] (role, content, indexed on [chatId, createdAt])

Job (id, type, status, payload, result, attempts, maxAttempts)
  // 异步任务队列，状态: PENDING | RUNNING | COMPLETED | FAILED | RETRYABLE | CANCELLED
```

`updatedAt` on Chat and GuestSession is maintained by DB trigger, not Prisma.

### API Routes

```
/api/auth/
├── register              → POST (create user, send verification email)
├── login                 → POST (create session with device info)
├── logout                → POST (delete session)
├── session               → GET (returns entry state + guest info)
├── password              → POST (change password, revokes other sessions)
├── forgot-password       → POST (send reset email)
├── reset-password        → POST (consume token, set new password)
├── resend-verification   → POST (resend email for unverified user)
└── sessions
    ├── /                 → GET (list all devices), DELETE (revoke all others)
    └── /[id]             → DELETE (revoke specific device)

/api/guest/
└── merge                 → POST (merge guest chats into user account)

/api/chat/
└── /                     → GET (list), POST (create), PATCH (update title), DELETE
```

### Path Alias & Testing

- `@/*` maps to `./src/*`
- Tests are colocated: `file.ts` → `file.test.ts`
- Vitest with jsdom environment
- Mock patterns in `auth-service.test.ts` show how to mock repository layer

### Settings Page

The `/settings` page requires verified email and contains:
- **SessionsForm** — View and revoke active devices
- **PasswordForm** — Change password (automatically revokes other sessions)

### Rate Limiting System

双维度限流设计，防止暴力破解和接口滥用：

```
src/server/rate-limit/
├── rate-limiter.ts         // 限流器统一接口
├── token-bucket.ts         // 令牌桶算法实现
├── sliding-window.ts       // 滑动窗口算法实现
├── rate-limit-error.ts     // RateLimitExceededError
└── rate-limit-policies.ts  // 业务策略配置
```

**登录限流** (双重保护):
- IP 维度: 10 次/小时 (Sliding Window) - 防同一来源批量撞库
- 邮箱维度: 3 次/分钟 (Token Bucket) - 防单账号密码爆破

**聊天限流**:
- 用户维度: 30 条/分钟 (Token Bucket)
- 游客: 暂不限流，靠试用额度 (trialMessageCount) 控制

**降级策略**:
- Redis 可用 → Redis 存储 (分布式场景)
- Redis 不可用 → 内存 fallback (仅适合本地开发)

位置: `src/app/api/auth/login/route.ts`、`src/app/api/chat/route.ts`

### Cache Service

统一缓存服务层，实现 Cache-Aside 模式：

```
src/server/cache/
├── cache-service.ts        // 缓存服务封装
└── cache-service.test.ts
```

**核心接口**:
- `getJson<T>(key)` - 读取 JSON 缓存
- `setJson(key, value, ttlSeconds)` - 写入 JSON 缓存
- `remember(key, options, loader)` - Cache-Aside 读流程

**当前缓存点**:
- `getCurrentSession()` - Session 查询缓存 (TTL 5 分钟)

**失效策略** (主动删除而非等 TTL):
- 登出 `logoutUser()`
- 改密码 `changePasswordForUser()`
- 重置密码 `resetPasswordWithToken()`
- 验证邮箱 `verifyEmailToken()`
- 撤销会话 `revokeSessionById()` / `revokeAllOtherSessions()`

**降级策略**:
- Redis 读写失败 → 静默忽略，继续走数据库
- 缓存层挂掉不影响核心业务可用性

### Async Queue System

基于 Redis + PostgreSQL 的持久化任务队列，用于异步处理邮件发送等耗时操作：

```
src/server/queue/
├── queue-types.ts              // 类型定义 (JobType, JobStatus, JobHandler)
├── queue-errors.ts              // 队列错误
├── queue-service.ts             // 入队接口
├── queue-repository.ts          // 队列数据访问 (主应用)
├── redis-queue-client.ts        // Redis 队列操作 (发布新任务通知)
├── redis-queue-operations.ts    // Redis LPUSH/RPOP 操作
└── worker/
    ├── worker-runner.ts         // Worker 主循环
    ├── queue-client.ts          // Worker 队列客户端
    ├── queue-repository.ts      // Worker 数据访问 (独立 Prisma 实例)
    └── handlers/
        └── email-handler.ts     // 邮件任务处理器
```

**工作流程**:
1. 应用调用 `enqueueJob(type, payload)` 将任务写入数据库
2. 同时向 Redis 发布通知，唤醒 Worker
3. Worker 通过 Redis 获取通知，从数据库拉取待处理任务
4. Worker 执行任务处理器，更新任务状态

**任务类型**:
- `SEND_VERIFICATION_EMAIL` - 发送验证邮件
- `SEND_PASSWORD_RESET_EMAIL` - 发送密码重置邮件

**Worker 命令**:
- `npm run worker` - 本地开发
- `npm run worker:test` - 测试环境
- `npm run worker:pro` - 生产环境

### Database Transaction

统一事务处理，支持跨表操作的一致性：

```
src/server/shared/database/
├── transaction.ts              // 事务封装 (runInTransaction)
├── transaction.test.ts
└── prisma-transaction.ts       // Prisma 事务适配器
```

**使用方式**:
```typescript
await runInTransaction(async (tx) => {
  await tx.user.update(...);
  await tx.session.create(...);
});
```

### Pagination (Cursor-based)

游标分页系统，适合大数据量和无限滚动场景：

```
src/server/shared/pagination/
├── pagination-types.ts         // PaginatedResult, CursorPaginationParams
├── cursor.ts                   // 游标编解码 (base64url)
├── pagination.ts               // buildPaginationParams, processPaginationResult
└── cursor.test.ts
```

**核心类型**:
- `PaginatedResult<T>` - `{ items, nextCursor, hasMore }`
- `CursorPaginationParams` - `{ cursor?, limit? }`

**使用流程**:
1. 前端传入 `cursor`（可选）和 `limit`
2. 后端使用 `buildPaginationParams()` 构建查询参数
3. 使用 `processPaginationResult()` 处理结果，生成下一页游标

### CI/CD & Deployment

**Docker 部署架构**:
```text
Browser → Nginx :80 → ai-chat container :3000 → Neon PostgreSQL
                         ↓
                    redis container :6379 (internal only)
```

**CI 流程** (.github/workflows/ci.yml):
- 触发: PR to main / push to main
- 步骤: lint → test → build Docker 镜像 → 推送到阿里云 ACR

**Deploy 流程** (.github/workflows/deploy.yml):
- 触发: CI 成功 + push to main
- 步骤: SSH 服务器 → 执行 scripts/docker-deploy.sh

**服务器脚本** (scripts/docker-deploy.sh):
1. git pull 最新代码
2. 校验 .env.production 环境变量
3. 执行 prisma migrate deploy
4. docker compose pull 拉取新镜像
5. docker compose up -d 重启容器
6. 健康检查 curl localhost:3000

**更多部署细节**: 见 `docs/project-notes/2026-03-28-deployment-command-cheatsheet.md`

### Troubleshooting

**Prisma Client 找不到模块**:
```bash
# 错误: Cannot find module '.prisma/client/default'
# 原因: Prisma Client 生成产物缺失或 dev 进程状态陈旧
# 解决:
npx prisma generate
# 然后重启开发服务器
```

**Redis 连接失败**:
- 检查 `REDIS_URL` 环境变量是否正确
- 缓存层会自动降级，不会阻塞主流程
- 本地开发可暂时忽略 Redis 相关错误

**端口冲突**:
```bash
# 检查 3000 端口占用
lsof -i :3000
# 或
ss -ltnp | grep :3000
```

**Docker 容器健康检查失败**:
```bash
# 查看容器状态
docker compose ps
# 查看容器日志
docker compose logs ai-chat
# 重启容器
docker compose restart
```
