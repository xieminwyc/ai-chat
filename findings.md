# Findings & Decisions

## 2026-04-08 Requirements
- 用户希望我继续产出一份“未来路线会写上，但明天先能直接开工”的计划
- 明天必须只围绕这 3 个缺口展开：
  - `认证/权限`
  - `安全校验`
  - `Next.js 服务端能力`
- 计划风格不能纯学习，也不能纯项目，要采用混合写法
- 用户当前重点是“以后接真实业务不慌”，所以计划必须帮他理解底层逻辑，而不是只给功能清单

## Requirements
- 用当前 `AI Chat` 项目输出一份非常实际的学习执行单
- 主线调整为：先补齐“全栈上线与排错能力”，再进入 AI agent
- 计划必须覆盖部署流程、数据库排查、服务端日志与错误处理
- 内容要贴合当前仓库，而不是抽象教程

## Research Findings
- 当前项目已经具备：
  - `TypeScript strict`
  - `Prisma + PostgreSQL`
  - `Route Handler + service/repository` 分层
  - `Vitest`
  - `Docker + CI/CD`
- 当前项目最明显的缺口是：
  - 没有 `User / Session / owner` 维度
  - 没有系统化输入校验和安全边界
  - 首页数据初始化仍然偏客户端 `fetch` 思维
- 仓库里已经有更完整的账号体系设计文档：
  - `docs/superpowers/specs/2026-04-02-auth-and-guest-trial-design.md`
  - 但它偏完整产品方案，不适合明天直接整包开做
- Next.js 16 本地文档确认了几条和本次设计强相关的事实：
  - `page.tsx` 与 `layout.tsx` 默认是 Server Components
  - `cookies()` 在 Next.js 16 中是异步 API
  - Cookie 的写操作应放在 Route Handler 或 Server Function 中
  - Route Handler 基于 Web `Request/Response`，适合承接 auth/session 写入
  - Server Components 可以安全地直接查询数据库，但仍然必须做鉴权和授权
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
| 这次先写 spec，再请用户确认，再写 implementation plan | 让明天的执行计划建立在已确认的设计之上 |
| 新路线采用“能力主线型 + 混合写法” | 更适合当前学习目标 |
| 认证第一阶段先做最小学习版自定义 session 方案 | 先理解 auth 机制，再保留后续接入认证库的空间 |
| 把完整游客/邮箱验证放到后续阶段 | 避免第一阶段过载 |
| plan 阶段先只覆盖正式用户认证，不在第一轮实现里加入 `GuestSession` | 让明天的任务可控，同时与长期产品设计解耦 |
| 聊天归属第一轮直接收敛为 `Chat.userId` 必填 | 先把“谁的聊天”这件事做实，再扩展游客主体 |
| 首页 bootstrap 改为服务端取数，聊天交互保留在 Client Component | 这是最适合当前仓库的 Next.js 服务端能力切入口 |
| 先产出仓库内计划文档，再在答复里做摘要 | 让后续执行有落点，可持续推进 |
| 推荐部署目标优先选 Vercel，替代方案再考虑 Railway / Render | 当前是标准 Next.js Node 项目，Vercel 的路径最短 |
| 重点把排错链路写成“前端 -> Route Handler -> Prisma / Postgres -> 模型 Provider” | 这正是用户当前最需要练熟的真实链路 |
| 把 AI agent 视为第四阶段，而不是立刻开做 | 基础设施不稳时，agent 调试成本会指数上升 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 需要确认 Next.js 16 的服务端行为是否与旧印象一致 | 改读本地 `node_modules/next/dist/docs/` 文档后再写设计 |
| README 仍是默认模板，不能作为当前项目操作指南 | 本次不顺手重写 README，先用计划文档承载执行单 |
| 官方搜索结果里噪声较多 | 只保留 Next.js、Prisma、Vercel 的官方资料作为参考 |

## Resources
- [2026-04-08-auth-security-server-learning-design.md](/Users/xiemin/project/AI%20Chat/docs/superpowers/specs/2026-04-08-auth-security-server-learning-design.md)
- [2026-04-08-auth-security-server-implementation.md](/Users/xiemin/project/AI%20Chat/docs/superpowers/plans/2026-04-08-auth-security-server-implementation.md)
- [2026-04-02-auth-and-guest-trial-design.md](/Users/xiemin/project/AI%20Chat/docs/superpowers/specs/2026-04-02-auth-and-guest-trial-design.md)
- [package.json](/Users/xiemin/monter/AI Chat/package.json)
- [prisma/schema.prisma](/Users/xiemin/monter/AI Chat/prisma/schema.prisma)
- [route.ts](/Users/xiemin/monter/AI Chat/src/app/api/chat/route.ts)
- [prisma.ts](/Users/xiemin/monter/AI Chat/src/lib/prisma.ts)
- [chat.ts](/Users/xiemin/monter/AI Chat/src/lib/chat.ts)
- [2026-03-25-fullstack-foundation-first.md](/Users/xiemin/monter/AI Chat/docs/superpowers/plans/2026-03-25-fullstack-foundation-first.md)
- Next.js 16 Deploying: https://nextjs.org/docs/app/getting-started/deploying
- Prisma Next.js + Vercel guide: https://www.prisma.io/docs/guides/frameworks/nextjs

## Visual/Browser Findings
- Next.js 16 本地文档明确：
  - `cookies()` 是异步函数
  - Server Component 可以读 cookie，但不能在渲染阶段写 cookie
  - 写 cookie 应放到 Route Handler 或 Server Function
  - Page/Layout 默认是 Server Component
  - Server Component 可以安全地直接使用 ORM/数据库查询
- Next.js 16.2.1 官方部署文档显示：Next.js 可以作为 Node.js server、Docker、static export 或 adapters 部署；Node.js server 方式支持全部 Next.js 特性
- Prisma 官方 Next.js 指南的 Vercel 部署部分建议：部署前确认 Prisma Client 会在安装流程里生成，并用 Vercel CLI 或平台部署

---
*Update this file after every 2 view/browser/search operations*
*This prevents visual information from being lost*
