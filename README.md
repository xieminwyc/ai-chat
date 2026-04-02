# AI Chat

一个基于 Next.js 16、Prisma 和 PostgreSQL 的学习型 AI 聊天项目。当前版本重点在于把聊天链路、数据库持久化、服务器部署和第一版 CI/CD 打通，方便持续练习全栈开发与上线流程。

## Tech Stack

- Next.js 16
- React 19
- Prisma 7
- PostgreSQL
- Vitest
- ESLint
- PM2
- Nginx
- GitHub Actions

## Project Structure

- `src/app/`
  - App Router 页面和 API 路由
- `src/components/`
  - 聊天界面组件
- `src/server/`
  - 服务端聊天逻辑、流式回复、仓储层
- `src/lib/`
  - 共享工具、Prisma 客户端、测试
- `prisma/`
  - Prisma schema
- `scripts/`
  - 环境变量加载脚本和部署脚本模板
- `.github/workflows/`
  - CI/CD workflow

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

## Environment Files

项目目前约定了 4 类环境文件：

- `.env.example`
  - 只放示例值，提交到仓库
- `.env.local`
  - 本地真实开发配置，不提交
- `.env.test`
  - 本地切换到测试链路时使用的配置
- `.env.production`
  - 本地模拟偏生产配置时使用的配置

目前需要的关键变量：

```env
DATABASE_URL=
SILICONFLOW_API_KEY=
SILICONFLOW_BASE_URL=
SILICONFLOW_MODEL=
```

真实线上密钥不要写进 `.env.example`、`.env.test` 或 `.env.production`。线上仍然由服务器本地的 `.env.local` 提供真实值。

## Scripts

### App commands

```bash
npm run dev
npm run dev:local
npm run dev:test
npm run dev:pro
```

含义：

- `dev` / `dev:local`
  - 加载 `.env.local`
- `dev:test`
  - 加载 `.env.test`
- `dev:pro`
  - 加载 `.env.production`

这里切换的是 `APP_ENV`，不是强行切换 `NODE_ENV`。这样 `next dev` 仍然保持开发模式，同时 Prisma 和应用能共用同一套 env 选择逻辑。

### Prisma commands

```bash
npm run prisma:generate
npm run prisma:generate:test
npm run prisma:generate:pro
npm run prisma:migrate:deploy
npm run prisma:migrate:deploy:test
npm run prisma:migrate:deploy:pro
```

### Quality commands

```bash
npm run lint
npm run test
npm run build
```

## How Env Loading Works

- `scripts/env.mjs` 根据 `APP_ENV` 选择 `.env.local`、`.env.test` 或 `.env.production`
- `prisma.config.ts` 也调用同一个 loader
- 对于 `next dev`，会先把目标 env 文件注入 `process.env`
- 因为 `process.env` 的优先级高于 `.env.*` 文件，`dev:test` 和 `dev:pro` 可以覆盖默认的 `.env.local`

## Deployment Architecture

当前线上结构：

```text
Browser
-> Nginx :80
-> Next.js :3000
-> Neon PostgreSQL
```

服务器职责：

- PM2 托管 `next start`
- Nginx 反向代理到 3000 端口
- 服务器本地 `.env.local` 保存真实生产环境变量

仓库中的 `scripts/deploy.sh` 是标准部署脚本模板，线上建议放在：

```text
/root/apps/ai-chat/scripts/deploy.sh
```

它负责：

- `git pull origin main`
- `npm ci`
- `npx prisma migrate deploy`
- `npm run build`
- `pm2 restart ai-chat`
- 健康检查

## CI/CD

### CI

文件：

- `.github/workflows/ci.yml`

触发：

- `pull_request` 到 `main`
- `push` 到 `main`

执行：

- `npm ci`
- `npm run lint`
- `npm run test`
- `npm run build`

CI 只使用安全占位值，不使用真实生产密钥。

### CD

文件：

- `.github/workflows/deploy.yml`

触发方式：

- 监听 `CI` workflow 成功完成
- 仅在 `main` 分支的 `push` 后部署

部署方式：

- GitHub Actions 通过 SSH 登录阿里云服务器
- 执行服务器上的 `scripts/deploy.sh`

### Required GitHub Secrets

需要在 GitHub 仓库中配置：

- `SERVER_HOST`
- `SERVER_PORT`
- `SERVER_USER`
- `SERVER_SSH_KEY`

## Testing and Verification

本地在提交前至少跑一遍：

```bash
npm run lint
npm run test
npm run build
```

如果你改了环境变量相关逻辑，可以单独跑：

```bash
npm run test -- src/lib/env-loader.test.ts
```

## Notes

- 当前项目仍然优先学习和沉淀“可重复部署”的能力，Docker 化部署是下一阶段
- 如果你刚刚在聊天或截图里暴露过真实 API key，记得立即去对应平台旋转或吊销
