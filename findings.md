# Findings & Decisions

## Requirements
- 用当前 `AI Chat` 项目输出一份非常实际的学习执行单
- 主线调整为：先补齐“全栈上线与排错能力”，再进入 AI agent
- 计划必须覆盖部署流程、数据库排查、服务端日志与错误处理
- 内容要贴合当前仓库，而不是抽象教程

## Research Findings
- 当前项目技术栈是 `Next.js 16.2.1 + React 19.2.4 + Prisma 7.5.0 + PostgreSQL + OpenAI SDK(SiliconFlow)`，脚本入口见 `package.json`
- Prisma schema 当前只有 `Chat` 和 `Message` 两张核心表，位于 `prisma/schema.prisma`
- 服务端主链路在 `src/app/api/chat/route.ts`：
  - `GET` 读聊天列表和历史
  - `POST` 创建/复用会话、落用户消息、调用模型、流式返回、落 assistant 消息
  - `PATCH` 改标题
  - `DELETE` 删会话
- 数据库连接在 `src/lib/prisma.ts`，使用 `@prisma/adapter-pg`，并开启 `log: ["error"]`
- 第三方模型接入在 `src/lib/chat.ts`，缺少 `SILICONFLOW_API_KEY` 时会直接抛错
- `.env.local` 中已确认存在这些环境变量名：
  - `DATABASE_URL`
  - `SILICONFLOW_API_KEY`
  - `SILICONFLOW_BASE_URL`
  - `SILICONFLOW_MODEL`
- 当前仓库还没有 git 提交历史，说明“可回滚、可比较、可追踪”的工程习惯也需要一起补
- 本机 PostgreSQL 当前由 Homebrew 的 `postgresql@17` 服务提供，`pg_isready` 已确认 `localhost:5432` 正常接受连接
- `prisma.config.ts` 明确使用 `dotenv.config({ path: ".env.local" })`，所以 Prisma 相关命令会从 `.env.local` 读取 `DATABASE_URL`
- 本地 `npx prisma migrate dev` 已验证当前 schema 与 migration 同步
- 真实请求 `POST /api/chat` 已证明完整链路可用：请求会创建 `Chat`、写入 `user` 消息、返回流式文本，并写入 `assistant` 消息
- 这次现场排错还验证了一条重要习惯：当本地请求失败时，先确认端口和进程归属，不要直接怀疑数据库或路由代码

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 先产出仓库内计划文档，再在答复里做摘要 | 让后续执行有落点，可持续推进 |
| 推荐部署目标优先选 Vercel，替代方案再考虑 Railway / Render | 当前是标准 Next.js Node 项目，Vercel 的路径最短 |
| 重点把排错链路写成“前端 -> Route Handler -> Prisma / Postgres -> 模型 Provider” | 这正是用户当前最需要练熟的真实链路 |
| 把 AI agent 视为第四阶段，而不是立刻开做 | 基础设施不稳时，agent 调试成本会指数上升 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| README 仍是默认模板，不能作为当前项目操作指南 | 本次不顺手重写 README，先用计划文档承载执行单 |
| 官方搜索结果里噪声较多 | 只保留 Next.js、Prisma、Vercel 的官方资料作为参考 |

## Resources
- [package.json](/Users/xiemin/monter/AI Chat/package.json)
- [prisma/schema.prisma](/Users/xiemin/monter/AI Chat/prisma/schema.prisma)
- [route.ts](/Users/xiemin/monter/AI Chat/src/app/api/chat/route.ts)
- [prisma.ts](/Users/xiemin/monter/AI Chat/src/lib/prisma.ts)
- [chat.ts](/Users/xiemin/monter/AI Chat/src/lib/chat.ts)
- [2026-03-25-fullstack-foundation-first.md](/Users/xiemin/monter/AI Chat/docs/superpowers/plans/2026-03-25-fullstack-foundation-first.md)
- Next.js 16 Deploying: https://nextjs.org/docs/app/getting-started/deploying
- Prisma Next.js + Vercel guide: https://www.prisma.io/docs/guides/frameworks/nextjs

## Visual/Browser Findings
- Next.js 16.2.1 官方部署文档显示：Next.js 可以作为 Node.js server、Docker、static export 或 adapters 部署；Node.js server 方式支持全部 Next.js 特性
- Prisma 官方 Next.js 指南的 Vercel 部署部分建议：部署前确认 Prisma Client 会在安装流程里生成，并用 Vercel CLI 或平台部署

---
*Update this file after every 2 view/browser/search operations*
*This prevents visual information from being lost*
