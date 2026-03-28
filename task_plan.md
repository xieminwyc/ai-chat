# Task Plan: 先补齐全栈上线与排错能力

## Goal
把当前 `AI Chat` 项目变成一套可重复练习的全栈训练场，先掌握本地数据库运维、部署、环境变量、日志与排错，再进入最小 AI agent。

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] 确认新的主线是“部署、数据库排查、服务端日志与错误处理优先”
- [x] 盘点当前项目的脚本、Prisma 模型、API 路由、环境变量和模型接入点
- [x] 记录官方部署与 Prisma 生产迁移资料
- **Status:** complete

### Phase 2: Planning & Structure
- [x] 确定学习计划按“本地运维 -> 部署 -> 日志与排错 -> 最小 agent”展开
- [x] 明确推荐的部署方案与替代方案
- [x] 把关键排错链路映射到当前代码文件
- **Status:** complete

### Phase 3: Documentation
- [x] 新增一份可执行学习计划文档
- [x] 在计划里写明命令、验证点、失败时先查哪里
- [x] 把当前项目中的关键文件路径列出来
- **Status:** complete

### Phase 4: Review & Alignment
- [x] 校验计划是否贴合当前仓库，而不是泛泛教程
- [x] 校验路线是否把 agent 放到基础设施稳定之后
- [x] 补充与官方文档一致的部署和 migration 注意事项
- **Status:** complete

### Phase 5: Delivery
- [x] 更新 `findings.md` 和 `progress.md`
- [x] 向用户交付执行顺序、关键文件入口和下一步建议
- [x] 保留后续继续推进这条主线所需的项目内记录
- **Status:** complete

## Key Questions
1. 这个项目的部署目标先选什么平台最省心？
2. 现在遇到 400/500、数据库异常、模型异常时，应该先从哪一层开始查？
3. 在什么条件满足后，才值得继续做 `get_time`、`web_search` 和 `AgentRun / ToolCall`？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 学习顺序改为“本地运维 -> 部署 -> 日志与排错 -> 最小 agent” | 先把系统跑稳，比继续堆 agent 功能更有复利 |
| 推荐先用 Vercel 部署当前 Next.js 项目 | 对当前技术栈最顺手，环境变量、部署和日志路径最短 |
| 线上数据库迁移明确使用 `prisma migrate deploy`，不把 `migrate dev` 带到生产 | 避免把本地开发习惯误带到线上 |
| 保留项目内持久规划文件，而不是只在对话里给清单 | 后续我们可以继续沿着这条主线推进，不会丢上下文 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `git log -5 --oneline` 报当前分支还没有 commit | 1 | 记录为项目现状，不影响生成执行单 |
| `planning-with-files` 的 superpowers 路径不存在 | 1 | 使用普通版 `planning-with-files` 说明继续执行 |

## Notes
- 当前仓库最关键的链路是：前端聊天页面 -> `src/app/api/chat/route.ts` -> `src/lib/prisma.ts` / `src/lib/chat.ts` -> PostgreSQL / SiliconFlow
- 当前 `.env.local` 已包含 `DATABASE_URL`、`SILICONFLOW_API_KEY`、`SILICONFLOW_BASE_URL`、`SILICONFLOW_MODEL`
- 当前 `package.json` 只有 `dev/build/start/lint/test`，后续真实部署时要复核 Prisma Client 生成流程
