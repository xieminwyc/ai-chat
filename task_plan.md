# Task Plan: AI Chat 认证、安全与服务端能力学习设计

## Goal
围绕当前 `AI Chat` 项目，先设计并落地一条“学习和项目混合”的下一阶段路线，让明天可以直接从 `认证/权限 -> 安全校验 -> Next.js 服务端能力` 开始推进。

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] 确认用户希望“未来路线会写上，但明天先只做三块核心缺口”
- [x] 复盘当前仓库已经具备的能力与仍然欠缺的能力
- [x] 确认计划需要同时服务“学习理解”和“项目实施”
- **Status:** complete

### Phase 2: Planning Approach
- [x] 给出 `能力主线型 / 产品主线型 / 理论主线型` 三种组织方式
- [x] 与用户确认最终采用“能力主线型 + 混合写法”
- [x] 明确明天的优先级顺序不能改成别的主线
- **Status:** complete

### Phase 3: Spec Writing
- [x] 结合当前仓库和已有账号体系设计，整理新的路线设计 spec
- [x] 核对 Next.js 16 本地文档中的 `cookies`、Route Handler、Server/Client Components 相关说明
- [x] 把“明天范围”和“后续路线”拆开写清楚
- **Status:** complete

### Phase 4: Review & User Sign-off
- [x] 复核 spec 是否足够贴合当前仓库与学习目标
- [x] 请用户先看一遍 spec 文档
- [x] 根据用户反馈决定是否需要调整设计
- **Status:** complete

### Phase 5: Implementation Plan
- [x] 基于确认后的 spec，写详细 implementation plan
- [x] 把明天的三个阶段拆成可直接执行的小步任务
- [x] 给出文件路径、测试方法和学习提示
- **Status:** complete

## Key Questions
1. 如何让计划既适合明天直接开工，又不会变成只看不做的学习清单？
2. 第一阶段应该优先做完整账号体系，还是先做最小认证基础？
3. 如何把 Next.js 服务端能力写成“真正在当前仓库能落地”的内容？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 计划采用“能力主线型 + 学习/项目混合写法” | 最贴合用户当前“边做边懂”的目标 |
| 明天只聚焦 `认证/权限 -> 安全校验 -> Next.js 服务端能力` | 这是当前仓库最真实、最值钱的能力缺口 |
| 把已有完整账号体系设计视为后续方向，而不是明天一次做完 | 避免第一阶段范围失控 |
| 先核对本地 Next.js 16 文档再写服务端能力设计 | 避免按旧版本印象给出不准的路线 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `planning-with-files` 的 session catchup 暂不支持原生 Codex session 解析 | 1 | 继续使用现有 `task_plan.md/findings.md/progress.md` 手动维护 |
| 初次读取 Next.js docs 的路径猜错 | 1 | 改为实际存在的 `node_modules/next/dist/docs/01-app/...` 路径 |

## Notes
- 当前下一步不是写实现代码，而是先把 spec 写清楚并交给用户确认
- 当前新 spec 文档应与 `docs/superpowers/specs/2026-04-02-auth-and-guest-trial-design.md` 形成“长期产品方向 + 明日学习切入路线”的配合关系
- 计划文档已写入 `docs/superpowers/plans/2026-04-08-auth-security-server-implementation.md`
