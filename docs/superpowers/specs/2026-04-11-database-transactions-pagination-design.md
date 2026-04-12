# 数据库事务与游标分页设计文档

## 文档概览

| 项目     | 内容                         |
| -------- | ---------------------------- |
| 文档主题 | 数据库事务与游标分页学习设计 |
| 面向对象 | 后端学习者                   |
| 当前阶段 | 设计版                       |
| 目标仓库 | `AI Chat`                    |

## 背景

当前项目的数据库操作都是**单条、原子性**的：

```typescript
// 例如：创建用户
await prisma.user.create({ data: { ... } });

// 例如：查询消息
await prisma.message.findMany({
  where: { chatId },
  orderBy: { createdAt: 'desc' },
  take: 50,
});
```

但真实业务中需要：

### 1. 事务（Transactions）

**问题场景**：

- Guest 合并时：创建 Session、更新 Guest、关联 Chat → 如果中间失败怎么办？
- 改密码时：更新密码、撤销其他 Session → 两步操作必须都成功或都失败
- 创建 Chat 和第一条 Message → Chat 创建了但 Message 失败了？

### 2. 游标分页（Cursor Pagination）

**问题场景**：

- 当前用 `skip/take` 分页：数据多了之后性能下降
- 深分页问题：`skip(10000)` 需要扫描 10000 条记录
- 数据新增/删除时，分页结果会重复或遗漏

## 核心目标

### Part 1: 事务（Transactions）

1. 理解 ACID 特性
2. 掌握 Prisma 事务 API
3. 识别需要事务的场景
4. 处理事务失败和重试

### Part 2: 游标分页（Cursor Pagination）

1. 理解游标分页原理
2. 实现基于唯一键的游标
3. 处理边界情况
4. 实现"向前"和"向后"分页

## 事务设计

### 什么是事务

**事务** 是一组数据库操作，要么全部成功，要么全部失败。

**ACID 特性**：

- **A**tomicity（原子性）：全部成功或全部失败
- **C**onsistency（一致性）：数据始终保持一致状态
- **I**solation（隔离性）：并发事务互不干扰
- **D**urability（持久性）：提交后永久保存

### 当前项目需要事务的场景

#### 场景 1：Guest 合并（高优先级）

```typescript
// 当前实现（有风险）
async function mergeGuestSession(userId: string, guestSessionId: string) {
  // 步骤1: 查询 Guest 的 Chats
  const chats = await prisma.chat.findMany({
    where: { guestSessionId },
  });

  // 步骤2: 逐个更新 Chat 的 userId
  for (const chat of chats) {
    await prisma.chat.update({
      where: { id: chat.id },
      data: { userId },
    });
  }

  // 步骤3: 标记 Guest 已合并
  await prisma.guestSession.update({
    where: { guestToken },
    data: { mergedAt: new Date() },
  });

  // 问题：如果步骤3失败，Chat 已经被改了，Guest 没标记为合并！
}
```

**改进后（使用事务）**：

```typescript
async function mergeGuestSession(userId: string, guestSessionId: string) {
  await prisma.$transaction(async (tx) => {
    // 步骤1: 查询 Guest 的 Chats
    const chats = await tx.chat.findMany({
      where: { guestSessionId },
    });

    // 步骤2: 批量更新 Chat 的 userId
    await tx.chat.updateMany({
      where: { guestSessionId },
      data: { userId },
    });

    // 步骤3: 标记 Guest 已合并
    await tx.guestSession.update({
      where: { id: guestSessionId },
      data: { mergedAt: new Date() },
    });
  });
  // 任何一步失败，全部回滚
}
```

#### 场景 2：创建 Chat 和第一条 Message

```typescript
// 当前实现
async function createChatWithMessage(userId: string, content: string) {
  const chat = await prisma.chat.create({
    data: {
      userId,
      title: content.slice(0, 50),
    },
  });

  // 如果这里失败怎么办？Chat 创建了但没有消息
  await prisma.message.create({
    data: {
      chatId: chat.id,
      role: "user",
      content,
    },
  });

  return chat;
}

// 改进后
async function createChatWithMessage(userId: string, content: string) {
  return await prisma.$transaction(async (tx) => {
    const chat = await tx.chat.create({
      data: {
        userId,
        title: content.slice(0, 50),
      },
    });

    await tx.message.create({
      data: {
        chatId: chat.id,
        role: "user",
        content,
      },
    });

    return chat;
  });
}
```

#### 场景 3：改密码 + 撤销其他 Session

```typescript
// 当前已经分开处理，应该合并到一个事务
async function changePasswordForUser(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  await prisma.$transaction(async (tx) => {
    // 1. 验证旧密码并更新
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash: hashedNewPassword },
    });

    // 2. 撤销其他 Session
    await tx.session.deleteMany({
      where: {
        userId,
        token: { not: currentSessionToken },
      },
    });
  });
}
```

### Prisma 事务 API

```typescript
// 方式1: 简单事务（推荐）
await prisma.$transaction(async (tx) => {
  // 所有操作用 tx 而不是 prisma
  await tx.user.create({ ... });
  await tx.chat.create({ ... });
});

// 方式2: 批量操作（原子性）
await prisma.$transaction([
  prisma.user.create({ data: user }),
  prisma.chat.create({ data: chat }),
]);

// 方式3: 带超时和重试
await prisma.$transaction(
  async (tx) => { ... },
  {
    maxWait: 5000,      // 等待事务的最长时间
    timeout: 10000,     // 事务执行超时
  }
);
```

### 事务隔离级别

PostgreSQL 默认隔离级别：**Read Committed**

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// 可选：显式设置隔离级别
```

### 事务错误处理

```typescript
import { Prisma } from "@prisma/client";

try {
  await prisma.$transaction(async (tx) => {
    // ...
  });
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // 唯一约束冲突
    if (error.code === "P2002") {
      throw new ConflictError("资源已存在");
    }
    // 外键约束冲突
    if (error.code === "P2003") {
      throw new BadRequestError("关联资源不存在");
    }
  }
  throw error;
}
```

## 游标分页设计

### 为什么需要游标分页

**当前分页方式（Offset-based）**：

```typescript
// 第1页
await prisma.message.findMany({
  where: { chatId },
  orderBy: { createdAt: "desc" },
  take: 50,
  skip: 0,
});

// 第2页
await prisma.message.findMany({
  where: { chatId },
  orderBy: { createdAt: "desc" },
  take: 50,
  skip: 50,
});

// 第100页
await prisma.message.findMany({
  where: { chatId },
  orderBy: { createdAt: "desc" },
  take: 50,
  skip: 5000, // 问题：需要扫描 5000 条记录！
});
```

**问题**：

- `skip(5000)` 需要数据库扫描并丢弃前 5000 条
- 数据越多，越深分页越慢
- 如果在翻页过程中有新数据，会出现重复或遗漏

### 游标分页原理

**游标（Cursor）**：使用唯一键作为"定位点"，而不是跳过固定数量。

```typescript
// 第1页
await prisma.message.findMany({
  where: { chatId },
  orderBy: { createdAt: 'desc', id: 'desc' },  // 复合排序
  take: 50,
});

// 返回：
[
  { id: 'msg_100', createdAt: '2024-01-10T10:00:00Z', ... },  // 最早的一条（作为游标）
  ...
  { id: 'msg_51', createdAt: '2024-01-09T10:00:00Z', ... },
]

// 第2页：用最后一条作为游标
await prisma.message.findMany({
  where: {
    chatId,
    createdAt: { lt: '2024-01-09T10:00:00Z' },  // 早于游标的时间
    OR: [
      { createdAt: { equals: '2024-01-09T10:00:00Z' }, id: { lt: 'msg_51' } },  // 同时间，ID 小于游标
    ],
  },
  orderBy: { createdAt: 'desc', id: 'desc' },
  take: 51,  // 多取一条，用于检查是否还有下一页
});

// 最后一条作为新的游标
```

### 游标分页接口设计

```typescript
// 类型定义
interface PaginationResult<T> {
  items: T[];
  nextCursor: string | null; // 下一页游标
  hasMore: boolean; // 是否还有更多
}

interface PaginationOptions {
  limit?: number; // 每页数量
  cursor?: string; // 当前游标（Base64 编码）
}

// 游标结构
interface Cursor {
  createdAt: string;
  id: string;
}

// 编码游标（传给前端）
function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

// 解码游标（前端传回）
function decodeCursor(encoded: string): Cursor {
  return JSON.parse(Buffer.from(encoded, "base64url").toString());
}
```

### 实现 Chat 列表游标分页

```typescript
// src/server/chat/chat-pagination.ts

export async function getChatsWithCursorPagination(
  userId: string,
  options: PaginationOptions,
): Promise<PaginationResult<Chat>> {
  const limit = options.limit ?? 20;
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;

  const chats = await prisma.chat.findMany({
    where: {
      userId,
      ...(cursor && {
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          {
            createdAt: { equals: new Date(cursor.createdAt) },
            id: { lt: cursor.id },
          },
        ],
      }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1, // 多取一条判断是否还有更多
  });

  const hasMore = chats.length > limit;
  const items = hasMore ? chats.slice(0, -1) : chats;

  // 最后一条作为下一页游标
  const lastItem = items[items.length - 1];
  const nextCursor = lastItem
    ? encodeCursor({
        createdAt: lastItem.createdAt.toISOString(),
        id: lastItem.id,
      })
    : null;

  return {
    items,
    nextCursor: hasMore ? nextCursor : null,
    hasMore,
  };
}
```

### Message 列表游标分页（聊天记录）

```typescript
// src/server/chat/message-pagination.ts

export async function getMessagesWithCursorPagination(
  chatId: string,
  options: PaginationOptions,
): Promise<PaginationResult<Message>> {
  const limit = options.limit ?? 50;
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;

  const messages = await prisma.message.findMany({
    where: {
      chatId,
      ...(cursor && {
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          {
            createdAt: { equals: new Date(cursor.createdAt) },
            id: { lt: cursor.id },
          },
        ],
      }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  // ... 同上
}
```

### 前后端交互

```typescript
// API 接口
GET /api/chats?limit=20
GET /api/chats?cursor=xxx&limit=20

// 响应
{
  "items": [...],
  "nextCursor": "eyJjcmVhdGVkQXQiOiIiLCJpZCI6Im1zZ18xMDAifQ==",
  "hasMore": true
}
```

```typescript
// 前端使用
const [chats, setChats] = useState([]);
const [nextCursor, setNextCursor] = useState<string | null>(null);

// 加载第一页
const loadChats = async () => {
  const res = await fetch("/api/chats?limit=20");
  const data = await res.json();
  setChats(data.items);
  setNextCursor(data.nextCursor);
};

// 加载更多
const loadMore = async () => {
  if (!nextCursor) return;

  const res = await fetch(`/api/chats?cursor=${nextCursor}&limit=20`);
  const data = await res.json();
  setChats((prev) => [...prev, ...data.items]);
  setNextCursor(data.nextCursor);
};
```

## 学习重点

### Part 1: 事务

1. **理解 ACID**
   - 为什么需要事务
   - 什么场景必须用事务

2. **Prisma 事务 API**
   - `$transaction` 函数
   - `tx` 对象的使用
   - 超时和重试

3. **事务边界**
   - 事务不要太长
   - 避免在事务中做外部调用
   - 死锁处理

### Part 2: 游标分页

1. **理解原理**
   - 为什么 offset 慢
   - 游标为什么快

2. **实现细节**
   - 复合排序键
   - 游标编码/解码
   - 边界处理

3. **前后端配合**
   - 游标传递
   - 无限滚动
   - 方向切换（向前/向后）

## 实施场景

### 事务场景（按优先级）

| 场景                     | 优先级 | 复杂度 |
| ------------------------ | ------ | ------ |
| 创建 Chat + 首条 Message | 高     | 低     |
| Guest 合并               | 高     | 中     |
| 改密码 + 撤销 Session    | 中     | 低     |
| 创建 User + Session      | 中     | 低     |
| 批量操作                 | 低     | 中     |

### 游标分页场景（按优先级）

| 场景                     | 优先级 | 复杂度 |
| ------------------------ | ------ | ------ |
| Message 列表（聊天记录） | 高     | 低     |
| Chat 列表（会话列表）    | 高     | 低     |
| AgentRun 列表            | 中     | 低     |
| Job 列表（队列）         | 中     | 低     |

## 文件清单

### 事务相关

**新增**:

- `src/server/shared/database/transaction.ts` - 事务工具函数
- `src/server/shared/database/transaction.test.ts`
- `src/server/chat/chat-transaction.service.ts` - Chat 相关事务操作

**修改**:

- `src/server/guest/guest-service.ts` - Guest 合并改用事务
- `src/server/auth/auth-service.ts` - 改密码改用事务
- `src/server/chat/chat-service.ts` - 创建 Chat+Message 改用事务

### 游标分页相关

**新增**:

- `src/server/shared/pagination/cursor.ts` - 游标编码/解码
- `src/server/shared/pagination/cursor.test.ts`
- `src/server/chat/chat-pagination.ts` - Chat 列表分页
- `src/server/chat/message-pagination.ts` - Message 列表分页

**修改**:

- `src/app/api/chats/route.ts` - 改用游标分页
- `src/app/api/chat/[id]/messages/route.ts` - 改用游标分页
- `src/components/chat-app.tsx` - 支持无限滚动

## 数据库优化

### 索引优化

```sql
-- 复合索引，支持游标分页
CREATE INDEX "Message_chatId_createdAt_id_idx"
ON "Message"("chatId", "createdAt" DESC, "id" DESC);

CREATE INDEX "Chat_userId_createdAt_id_idx"
ON "Chat"("userId", "createdAt" DESC, "id" DESC);
```

## 对应文档

- 实现计划: `docs/superpowers/plans/2026-04-11-database-transactions-pagination-implementation.md`
- 后端学习地图: `docs/superpowers/specs/2026-04-10-backend-learning-map-for-ai-engineer.md`
