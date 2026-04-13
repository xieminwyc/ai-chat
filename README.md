# AI Chat

一个基于 Next.js 16、Prisma 7 和 PostgreSQL 的学习型 AI 聊天项目。支持流式回复、用户认证、游客试用、异步邮件队列和 Docker 部署。

## Tech Stack

- Next.js 16 (App Router, standalone output)
- React 19
- Prisma 7 (PostgreSQL, Neon)
- Redis (ioredis, 缓存 + 限流 + 异步队列)
- Resend (邮件发送)
- OpenAI SDK (SiliconFlow API)
- Vitest + Testing Library
- Docker / Docker Compose
- Nginx (反向代理)
- GitHub Actions (CI → CD 自动部署到阿里云)

## Project Structure

```text
src/
├── app/                    # App Router 页面和 API 路由
│   └── api/
│       ├── auth/           # 登录、注册、会话管理
│       ├── chat/           # 聊天 CRUD + 流式回复
│       └── guest/          # 游客合并
├── components/             # 聊天界面组件
├── server/
│   ├── auth/               # 认证：仓储层、服务层、错误、Schema
│   ├── chat/               # 聊天：仓储层、服务层、流式回复
│   ├── guest/              # 游客试用（3 条免费消息）
│   ├── queue/              # 异步任务队列 (Redis + PostgreSQL)
│   │   └── worker/         # Worker 运行时 + 处理器
│   ├── rate-limit/         # 令牌桶 + 滑动窗口限流
│   ├── cache/              # Cache-Aside 缓存服务 (Redis)
│   └── shared/             # 通用错误、分页、事务
├── lib/                    # Prisma 客户端、Redis 客户端、工具
prisma/                     # Prisma schema + migrations
scripts/                    # 环境变量加载、部署脚本、Worker 入口
.github/workflows/          # CI/CD workflow
```

## Local Setup

1. 安装依赖

```bash
npm ci
```

2. 按需准备环境变量

```bash
cp .env.example .env.local
```

3. 启动开发服务器

```bash
npm run dev
```

默认访问：

```text
http://localhost:3000
```

4. （可选）启动本地 Worker

```bash
npm run worker
```

## npm Scripts

### 开发服务器

```bash
npm run dev          # 加载 .env.local
npm run dev:local    # 同上
npm run dev:test     # 加载 .env.test
npm run dev:pro      # 加载 .env.production
```

环境切换通过 `APP_ENV`（不是 `NODE_ENV`），`next dev` 始终是开发模式。

### Worker

```bash
npm run worker          # 本地开发 (APP_ENV=local)
npm run worker:test     # 测试环境
npm run worker:pro      # 生产环境
```

Worker 处理异步任务（发送验证邮件、密码重置邮件），通过 Redis 接收通知、PostgreSQL 持久化任务状态。

### Prisma

```bash
npm run prisma:generate            # 生成本地 Client
npm run prisma:generate:test       # 生成测试环境 Client
npm run prisma:generate:pro        # 生成生产环境 Client
npm run prisma:migrate:deploy      # 部署本地 migration
npm run prisma:migrate:deploy:test # 部署测试环境 migration
npm run prisma:migrate:deploy:pro  # 部署生产环境 migration
```

### 质量检查

```bash
npm run lint
npm run test
npm run build
```

## Environment Files

| 文件 | 用途 | 提交到仓库 |
|------|------|------------|
| `.env.example` | 示例值 | 是 |
| `.env.local` | 本地真实配置 | 否 |
| `.env.test` | 测试环境配置 | 否 |
| `.env.production` | 生产配置 | 否 |

关键变量：

```env
APP_URL=
DATABASE_URL=
REDIS_URL=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
SILICONFLOW_API_KEY=
SILICONFLOW_BASE_URL=
SILICONFLOW_MODEL=
```

环境加载机制：`scripts/env.mjs` 根据 `APP_ENV` 选择对应 `.env.*` 文件，`prisma.config.ts` 也复用同一逻辑。

## Deployment Architecture

```text
Browser → Nginx :80 → ai-chat container :3000 → Neon PostgreSQL
                          ↕
                    redis container :6379 (Docker 内部网络)
```

- Nginx 反向代理到容器 3000 端口
- Docker Compose 同机托管 `ai-chat`、`worker`、`redis`
- Redis 只走 Docker 内部网络，不开放公网 6379
- 服务器本地 `.env.production` 提供运行时真实值
- Worker 与 ai-chat 共用同一镜像，通过不同 command 启动

### Dockerfile

三阶段构建：`deps`（装依赖）→ `builder`（next build）→ `runner`（最小运行镜像）。使用 `output: standalone`，最终镜像只包含运行时必需产物。

### compose.yml

三个服务：

- **redis** — `redis:7-alpine`，开启 AOF 持久化，仅内部网络
- **ai-chat** — 应用主容器，暴露 3000 端口，依赖 redis 健康检查
- **worker** — 异步任务处理器，不暴露端口，依赖 redis

镜像从阿里云 ACR 拉取：`crpi-y387mtxqhofw4ibe.cn-guangzhou.personal.cr.aliyuncs.com/xieminwyc/ai-chat:latest`

## Server Commands

在服务器 `/root/apps/ai-chat` 目录下执行。

### 服务管理

```bash
docker compose up -d          # 启动所有服务
docker compose down            # 停止所有服务
docker compose restart ai-chat # 重启应用
docker compose restart worker  # 重启 Worker
docker compose ps              # 查看容器状态
```

### 日志查看

```bash
docker compose logs ai-chat -f           # 跟踪应用日志
docker compose logs worker -f             # 跟踪 Worker 日志
docker compose logs redis -f              # 跟踪 Redis 日志
docker compose logs ai-chat --tail 100    # 最近 100 行
docker compose logs worker --err --tail 50 # 只看错误日志
```

### 更新部署

```bash
# 一键部署（走 deploy 脚本，包含 git pull + migrate + pull image + restart）
bash scripts/docker-deploy.sh

# 手动更新步骤
git pull origin main
docker compose -f compose.yml pull
docker run --rm --network ai-chat_default \
  -e DATABASE_URL \
  crpi-y387mtxqhofw4ibe.cn-guangzhou.personal.cr.aliyuncs.com/xieminwyc/ai-chat:latest \
  node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
docker compose -f compose.yml up -d
```

### 健康检查 & 排错

```bash
curl -f http://localhost:3000               # 应用健康检查
docker compose exec redis redis-cli ping     # Redis 连通性
docker compose exec ai-cat sh                # 进入应用容器
docker stats --no-stream                     # 容器资源占用
```

## CI/CD

### CI (`.github/workflows/ci.yml`)

触发：PR 和 push 到 `main`

执行：`npm ci` → `lint` → `test` → `build` → 构建 Docker 镜像 → 推送到阿里云 ACR

CI 只使用安全占位值，不使用真实生产密钥。

### CD (`.github/workflows/deploy.yml`)

触发：CI 成功 + push 到 `main`

部署：GitHub Actions SSH 登录服务器 → 执行 `scripts/docker-deploy.sh`

### GitHub Secrets

| Secret | 用途 |
|--------|------|
| `SERVER_HOST` | 服务器 IP |
| `SERVER_PORT` | SSH 端口 |
| `SERVER_USER` | SSH 用户名 |
| `SERVER_SSH_KEY` | SSH 私钥 |

## Testing

提交前至少跑一遍：

```bash
npm run lint
npm run test
npm run build
```

单独跑某个测试：

```bash
npx vitest run src/server/auth/auth-service.test.ts
```

## Notes

- 推荐使用 Docker Compose 部署。如果需要用 pm2 在宿主机运行，注意以下事项：
  - 应用必须用 `node .next/standalone/server.js` 启动（不是 `next start`，standalone 模式下 `next start` 无法正确工作）
  - `REDIS_URL` 需改为 `redis://127.0.0.1:6379`（`redis://redis:6379` 只在 Docker 网络内生效，宿主机无法解析）
  - Redis 容器需要映射端口到宿主机（compose.yml 里取消 redis 的 `ports` 注释）
  - Worker 用 `npm run worker:pro` 启动，同样需要宿主机可访问的 Redis 地址
- 暴露过真实 API key 后立即去对应平台轮换或吊销