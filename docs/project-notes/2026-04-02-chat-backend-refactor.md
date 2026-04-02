# 2026-04-02 Chat Backend Refactor

## 这次改了什么

把原来集中写在 `src/app/api/chat/route.ts` 里的聊天后端逻辑拆开了：

- `src/app/api/chat/route.ts`
  - 只保留 Route Handler 的职责
  - 负责读请求、做基础校验、调用 service、返回响应
- `src/server/chat/chat-service.ts`
  - 负责聊天主流程
  - 包括读取会话、准备消息、创建新会话、组织一次回复流程
- `src/server/chat/chat-repository.ts`
  - 负责所有 Prisma 读写
  - 包括 chat / message 的查询、创建、删除、更新
- `src/server/chat/chat-stream.ts`
  - 负责流式响应
  - 负责在流结束后把 assistant 完整回复落库
- `src/server/ai/chat-provider.ts`
  - 负责模型调用
  - 从原来的 `src/lib/chat.ts` 中拆出了 provider 相关逻辑
- `src/server/chat/chat-logger.ts`
  - 统一放聊天接口日志工具
- `src/server/chat/chat-types.ts`
  - 放聊天服务端相关类型

现在的关系更清楚：

```text
chat-app.tsx
  -> /api/chat
    -> route.ts
      -> chat-service.ts
        -> chat-repository.ts
        -> chat-provider.ts
        -> chat-stream.ts
```

## 为什么要这样拆

原来 `route.ts` 同时承担了：

- HTTP 层
- Prisma 查询
- 聊天业务流程
- AI 调用
- 流式响应
- assistant 消息落库
- 日志

文件职责太多，后面继续加功能会越来越难维护。

这次拆分后的目标是：

- Route Handler 只做 Route Handler
- 数据库读写集中到 repository
- 聊天流程集中到 service
- 流式逻辑单独维护
- AI provider 单独维护

这样后面如果继续加：

- 用户体系
- 多模型
- 知识库
- 更细的日志
- 权限和鉴权

会更容易扩展。

## 测试也一起调整了

这次不只是挪文件，也同步把测试结构跟着拆了：

- `src/app/api/chat/route.test.ts`
  - 改成只测 route 是否正确委托给 service / stream
- `src/server/chat/chat-repository.test.ts`
  - 测 Prisma 调用形状
- `src/server/chat/chat-service.test.ts`
  - 测聊天主流程
- `src/server/chat/chat-stream.test.ts`
  - 测流式输出和 assistant 落库

## 这次验证结果

我实际跑过：

```bash
npm test -- src/server/chat/chat-repository.test.ts src/server/chat/chat-service.test.ts src/server/chat/chat-stream.test.ts src/app/api/chat/route.test.ts src/lib/chat.test.ts src/lib/chat-provider.test.ts
npm run lint
npm run build
```

结果：

- 测试通过
- lint 通过
- build 通过

## 这次踩到的一个坑

开发环境里一度出现了这个错误：

```text
Cannot find module '.prisma/client/default'
```

这个问题不是聊天拆分本身的业务逻辑错误，而是 Prisma Client 生成产物在本地 dev 环境里缺失或 dev 进程还拿着旧状态。

这次通过下面两步恢复：

```bash
npx prisma generate
```

然后重启本地开发服务器。

如果以后本地又遇到：

```text
Failed to load external module @prisma/client...
Cannot find module '.prisma/client/default'
```

优先这样处理：

1. 先执行 `npx prisma generate`
2. 再重启 `npm run dev`

## 当前结构结论

对这个项目现在的体量来说，这一版结构比直接上大型 `modules/*` 架构更合适：

- 比原来单个 `route.ts` 全包更清楚
- 比大项目模块化方案更轻
- 适合当前继续学习 Next.js 的前后端边界

后面如果功能继续明显增多，再考虑从 `server/chat/*` 进一步演进到 `modules/chat/*`。
