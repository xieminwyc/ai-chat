# 数据库事务与游标分页实现计划

## 文档概览

| 项目 | 内容 |
| --- | --- |
| 计划主题 | 数据库事务与游标分页实现计划 |
| 参考设计 | `docs/superpowers/specs/2026-04-11-database-transactions-pagination-design.md` |
| 预计工期 | 4 天 |
| 当前状态 | 待开始 |

## 实现原则

1. **先事务后分页** - 先掌握事务，再做分页优化
2. **渐进式迁移** - 不破坏现有功能
3. **真实场景驱动** - 用项目中的实际需求练手
4. **性能验证** - 用数据证明优化效果

## Phase 1: 事务基础设施（Day 1）

### 目标
掌握 Prisma 事务 API，改造高优先级场景

### 任务清单

#### Task 1.1: 创建事务工具函数
```typescript
// src/server/shared/database/transaction.ts

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export async function withTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
  }
): Promise<T> {
  return await prisma.$transaction(callback, {
    maxWait: options?.maxWait ?? 5000,
    timeout: options?.timeout ?? 10000,
  });
}

// 辅助函数：带重试的事务
export async function withRetryableTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await prisma.$transaction(callback);
    } catch (error) {
      lastError = error as Error;
      
      // 可重试的错误码
      const isRetryable = error instanceof Error && 
        'code' in error && 
        ['P2034'].includes(error.code as string);

      if (!isRetryable || i === maxRetries) {
        throw error;
      }

      // 指数退避
      await sleep(100 * Math.pow(2, i));
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

#### Task 1.2: 改造 Chat 创建（事务）
```typescript
// src/server/chat/chat-service.ts

// 原来: 分两步操作，有风险
async function createChat(userId: string, firstMessage: string) {
  const chat = await prisma.chat.create({ ... });
  await prisma.message.create({ ... });  // 可能失败
  return chat;
}

// 现在: 原子操作
async function createChatWithFirstMessage(
  userId: string,
  content: string
): Promise<Chat> {
  return await withTransaction(async (tx) => {
    const chat = await tx.chat.create({
      data: {
        userId,
        title: content.slice(0, 50),
      },
    });

    await tx.message.create({
      data: {
        chatId: chat.id,
        role: 'user',
        content,
      },
    });

    return chat;
  });
}
```

#### Task 1.3: 改造 Guest 合并（事务）
```typescript
// src/server/guest/guest-service.ts

// 原来: 多步操作，有风险
async function mergeGuestSession(userId: string, guestSessionId: string) {
  const chats = await prisma.chat.findMany({ ... });
  for (const chat of chats) {
    await prisma.chat.update({ ... });  // 可能中间失败
  }
  await prisma.guestSession.update({ ... });
}

// 现在: 原子操作
async function mergeGuestSession(userId: string, guestSessionId: string) {
  await withTransaction(async (tx) => {
    // 一次性批量更新所有 Chat
    await tx.chat.updateMany({
      where: { guestSessionId },
      data: { userId },
    });

    // 标记 Guest 已合并
    await tx.guestSession.update({
      where: { id: guestSessionId },
      data: { mergedAt: new Date() },
    });
  });
}
```

#### Task 1.4: 测试事务回滚
```typescript
// src/server/shared/database/transaction.test.ts

describe('Transaction', () => {
  it('should rollback all operations on error', async () => {
    let chatId: string;

    // 事务中故意抛错
    try {
      await withTransaction(async (tx) => {
        const chat = await tx.chat.create({
          data: { userId: 'test-user', title: 'Test' },
        });
        chatId = chat.id;

        await tx.message.create({
          data: { chatId, role: 'user', content: 'Hello' },
        });

        throw new Error('Intentional error');
      });
    } catch (e) {
      // 预期失败
    }

    // 验证: Chat 和 Message 都不应该被创建
    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    expect(chat).toBeNull();
  });
});
```

### 验证命令
```bash
# 运行测试
npm test -- src/server/shared/database/transaction.test.ts

# 验证现有功能
npm test -- src/server/chat/chat-service.test.ts
npm test -- src/server/guest/guest-service.test.ts
```

---

## Phase 2: 改密码事务（Day 1-2）

### 目标
将改密码和撤销 Session 合并到一个事务

### 任务清单

#### Task 2.1: 分析现有实现
```typescript
// src/server/auth/auth-service.ts

// 当前实现: 分两步
async function changePasswordForUser(...) {
  // 1. 更新密码
  await prisma.user.update({ ... });
  
  // 2. 撤销其他 Session
  await prisma.session.deleteMany({ ... });
}
```

#### Task 2.2: 合并到事务
```typescript
async function changePasswordForUser(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await withTransaction(async (tx) => {
    // 1. 验证并更新密码
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

#### Task 2.3: 更新测试
```typescript
// src/server/auth/auth-service.test.ts

it('should revoke other sessions in same transaction', async () => {
  // 创建多个 Session
  const session1 = await createSession(userId);
  const session2 = await createSession(userId);
  
  // 改密码（指定 session1 为当前）
  await changePasswordForUser(userId, oldPass, newPass, session1.token);
  
  // 验证: session1 有效，session2 被删除
  expect(await getSession(session1.token)).not.toBeNull();
  expect(await getSession(session2.token)).toBeNull();
});
```

### 验证命令
```bash
npm test -- src/server/auth/auth-service.test.ts
```

---

## Phase 3: 游标分页基础设施（Day 2-3）

### 目标
实现游标分页通用能力，应用到 Chat 和 Message 列表

### 任务清单

#### Task 3.1: 创建游标工具
```typescript
// src/server/shared/pagination/cursor.ts

export interface Cursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(encoded: string): Cursor {
  try {
    return JSON.parse(
      Buffer.from(encoded, 'base64url').toString()
    );
  } catch {
    throw new Error('Invalid cursor');
  }
}

export interface PaginationResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PaginationOptions {
  limit?: number;
  cursor?: string;
}

export async function paginateWithCursor<T extends { createdAt: Date; id: string }>({
  query,
  orderBy,
  options,
}: {
  query: (args: any) => Prisma.Promise<typeof query>;
  orderBy: Record<string, 'asc' | 'desc'>;
  options: PaginationOptions;
}): Promise<PaginationResult<T>> {
  const limit = options.limit ?? 20;
  const decodedCursor = options.cursor ? decodeCursor(options.cursor) : null;

  const items = await query({
    ...(decodedCursor && {
      where: {
        OR: [
          { createdAt: { lt: new Date(decodedCursor.createdAt) } },
          { 
            createdAt: { equals: new Date(decodedCursor.createdAt) },
            id: { lt: decodedCursor.id }
          },
        ],
      },
    },
    orderBy,
    take: limit + 1,
  });

  const hasMore = items.length > limit;
  const slicedItems = hasMore ? items.slice(0, -1) : items;

  const lastItem = slicedItems[slicedItems.length - 1];
  const nextCursor = lastItem ? encodeCursor({
    createdAt: lastItem.createdAt.toISOString(),
    id: lastItem.id,
  }) : null;

  return {
    items: slicedItems,
    nextCursor: hasMore ? nextCursor : null,
    hasMore,
  };
}
```

#### Task 3.2: 应用到 Chat 列表
```typescript
// src/server/chat/chat-pagination.ts

import { prisma } from '@/lib/prisma';
import { paginateWithCursor, type PaginationResult, type PaginationOptions } from '@/server/shared/pagination/cursor';

export async function getChatsByUserId(
  userId: string,
  options: PaginationOptions
): Promise<PaginationResult<Chat>> {
  return paginateWithCursor<Chat>({
    query: (args) => prisma.chat.findMany({
      where: { userId, ...args.where },
      ...args,
    }),
    orderBy: { createdAt: 'desc', id: 'desc' },
    options,
  });
}
```

#### Task 3.3: 应用到 Message 列表
```typescript
// src/server/chat/message-pagination.ts

export async function getMessagesByChatId(
  chatId: string,
  options: PaginationOptions
): Promise<PaginationResult<Message>> {
  return paginateWithCursor<Message>({
    query: (args) => prisma.message.findMany({
      where: { chatId, ...args.where },
      ...args,
    }),
    orderBy: { createdAt: 'desc', id: 'desc' },
    options,
  });
}
```

#### Task 3.4: 更新 API 接口
```typescript
// src/app/api/chats/route.ts

export async function GET(request: Request) {
  const { userId } = await getSession(request);
  const searchParams = request.nextUrl.searchParams;
  
  const limit = parseInt(searchParams.get('limit') ?? '20');
  const cursor = searchParams.get('cursor') ?? undefined;

  const result = await getChatsByUserId(userId, { limit, cursor });

  return NextResponse.json(result);
}
```

#### Task 3.5: 添加索引优化
```sql
-- prisma/migrations/xxx_add_pagination_indexes/migration.sql

-- Message 游标分页索引
CREATE INDEX "Message_chatId_createdAt_id_idx" 
ON "Message"("chatId", "createdAt" DESC, "id" DESC);

-- Chat 游标分页索引
CREATE INDEX "Chat_userId_createdAt_id_idx" 
ON "Chat"("userId", "createdAt" DESC, "id" DESC);
```

### 验证命令
```bash
# 执行迁移
APP_ENV=local node scripts/env.mjs npx prisma migrate dev --name add_pagination_indexes

# 运行测试
npm test -- src/server/shared/pagination/cursor.test.ts
npm test -- src/server/chat/chat-pagination.test.ts
npm test -- src/server/chat/message-pagination.test.ts
```

---

## Phase 4: 前端无限滚动（Day 3-4）

### 目标
前端支持游标分页的无限滚动

### 任务清单

#### Task 4.1: 创建 useInfiniteScroll Hook
```typescript
// src/hooks/use-infinite-scroll.ts

export function useInfiniteScroll<T>(
  fetchFunction: (cursor: string | null) => Promise<PaginationResult<T>>,
  options: { initialLimit?: number } = {}
) {
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    try {
      const result = await fetchFunction(nextCursor);
      
      setItems(prev => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } finally {
      setIsLoading(false);
    }
  }, [fetchFunction, nextCursor, isLoading, hasMore]);

  const reset = useCallback(() => {
    setItems([]);
    setNextCursor(null);
    setHasMore(true);
  }, []);

  // 初始加载
  useEffect(() => {
    loadMore();
  }, []);

  return { items, loadMore, isLoading, hasMore, reset };
}
```

#### Task 4.2: 更新 ChatList 组件
```typescript
// src/components/chat-list.tsx

export function ChatList() {
  const { items: chats, loadMore, isLoading, hasMore } = useInfiniteScroll(
    async (cursor) => {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      params.set('limit', '20');

      const res = await fetch(`/api/chats?${params}`);
      return await res.json();
    }
  );

  return (
    <div>
      {chats.map(chat => (
        <ChatItem key={chat.id} chat={chat} />
      ))}
      
      {hasMore && (
        <button onClick={loadMore} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
```

#### Task 4.3: 添加滚动监听
```typescript
// 支持滚动到底部自动加载

export function useInfiniteScroll<T>(...) {
  // ... 现有代码

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { threshold: 1.0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  return { items, loadMore, isLoading, hasMore, reset, observerTarget };
}
```

### 验证命令
```bash
# 启动开发服务器
npm run dev

# 测试: 
# 1. 滚动到底部应该自动加载更多
# 2. 刷新页面应该显示最新内容
# 3. 新增内容应该在顶部可见
```

---

## Phase 5: 测试与文档（Day 4）

### 目标
完善测试覆盖，编写学习文档

### 任务清单

#### Task 5.1: 补充测试
```bash
# 事务测试
npm test -- src/server/shared/database/transaction.test.ts

# 游标分页测试
npm test -- src/server/shared/pagination/

# 集成测试
npm test -- src/server/chat/
```

#### Task 5.2: 性能对比测试
```typescript
// 创建测试脚本对比 offset vs cursor

// offset 分页
console.time('offset-page-1000');
await prisma.message.findMany({
  skip: 1000,
  take: 50,
});
console.timeEnd('offset-page-1000');
// 约 50-200ms（取决于数据量）

// cursor 分页
console.time('cursor-page-1000');
await prisma.message.findMany({
  where: {
    createdAt: { lt: someDate },
    id: { lt: someId },
  },
  take: 50,
});
console.timeEnd('cursor-page-1000');
// 约 5-20ms（不依赖 skip）
```

#### Task 5.3: 编写学习文档
- 创建学习笔记（learning.md）
- 记录踩坑和解决方案
- 总结事务和分页的最佳实践

#### Task 5.4: 更新文档
- 更新 CLAUDE.md
- 更新 progress.md

### 最终验证
```bash
npm test
npm run build
npm run lint
```

---

## 学习总结

### 学到的能力

1. **事务**
   - ACID 特性
   - Prisma 事务 API
   - 事务边界设计
   - 死锁处理

2. **游标分页**
   - 游标原理
   - 复合排序键
   - 前端无限滚动
   - 性能优化

### 性能对比

| 场景 | Offset | Cursor | 提升 |
|------|--------|--------|------|
| 第1页 | ~5ms | ~5ms | - |
| 第10页 | ~20ms | ~5ms | 4x |
| 第100页 | ~200ms | ~5ms | 40x |
| 第1000页 | ~2000ms | ~5ms | 400x |

### 可扩展场景

- 事务：复杂业务流程、财务操作、库存扣减
- 分页：大数据量列表、时间线、日志流
