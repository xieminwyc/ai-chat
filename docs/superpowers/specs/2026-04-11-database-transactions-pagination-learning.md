# 数据库事务与游标分页学习笔记

## 这一阶段到底在练什么

表面上只是"加个事务"和"改个分页方式"，但本质上在练 4 件事：

1. **数据一致性** - 理解为什么有些操作必须全部成功或全部失败
2. **性能优化** - 从 O(n) 的 offset 查询变成 O(1) 的 cursor 查询
3. **前后端配合** - 游标如何在客户端和服务端之间传递
4. **边界处理** - 各种异常情况下的兜底方案

## 一句话总结

> 事务保证"要么全做，要么全不做"；游标分页让"翻页越深越慢"变成"翻到哪页都快"。

---

## Part 1: 事务

### 为什么需要事务

想象一个场景：用户注册成功后，需要：

1. 创建 User 记录
2. 创建 Session 记录
3. 发送欢迎邮件

**没有事务**：

```typescript
// 步骤1: 创建用户
const user = await prisma.user.create({ data: userData }); // ✅ 成功

// 步骤2: 创建会话
await prisma.session.create({ data: sessionData }); // ❌ 失败！

// 步骤3: 发邮件（不会执行）
```

**结果**：用户被创建了，但没有登录方式，用户无法登录。

**有事务**：

```typescript
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: userData });
  await tx.session.create({ data: sessionData });

  // 任何一步失败，全部回滚
});
```

### ACID 是什么

| 特性            | 含义   | 例子                 |
| --------------- | ------ | -------------------- |
| **A**tomicity   | 原子性 | 要么全做，要么全不做 |
| **C**onsistency | 一致性 | 数据始终处于有效状态 |
| **I**solation   | 隔离性 | 并发事务互不干扰     |
| **D**urability  | 持久性 | 提交后永久保存       |

### 当前项目需要事务的场景

#### 场景 1：创建 Chat 和第一条 Message

**问题**：Chat 创建了但 Message 创建失败

**解决**：

```typescript
await prisma.$transaction(async (tx) => {
  const chat = await tx.chat.create({ ... });
  await tx.message.create({ ... });
});
```

#### 场景 2：Guest 合并

**问题**：Chat 的 userId 改了，但 Guest 没标记合并

**解决**：

```typescript
await prisma.$transaction(async (tx) => {
  await tx.chat.updateMany({ where: { guestSessionId }, data: { userId } });
  await tx.guestSession.update({ where: { id }, data: { mergedAt } });
});
```

#### 场景 3：改密码 + 撤销其他 Session

**问题**：密码改了但 Session 没撤销

**解决**：

```typescript
await prisma.$transaction(async (tx) => {
  await tx.user.update({ data: { passwordHash } });
  await tx.session.deleteMany({ where: { userId, token: { not: current } } });
});
```

### 事务陷阱

#### 陷阱 1：事务太长

```typescript
// ❌ 不好：事务中做了外部调用
await prisma.$transaction(async (tx) => {
  await tx.user.create({ ... });

  // 外部 API 调用（慢！）
  await sendEmail(user.email);  // 不要在事务里做这个

  await tx.session.create({ ... });
});
```

**为什么不好**：

- 外部调用可能很慢（几秒）
- 数据库连接被占用
- 其他事务等待，可能导致死锁

**正确做法**：

```typescript
// ✅ 好：数据库操作在事务里，外部调用在事务外
const user = await prisma.$transaction(async (tx) => {
  const u = await tx.user.create({ ... });
  await tx.session.create({ ... });
  return u;
});

// 事务结束后再发邮件
await sendEmail(user.email);
```

#### 陷阱 2：死锁

```typescript
// 事务 A: 先锁 Chat，再锁 User
await prisma.$transaction(async (tx) => {
  const chat = await tx.chat.findUnique({ where: { id } });
  await tx.user.update({ ... });
});

// 事务 B: 先锁 User，再锁 Chat（同时执行）
await prisma.$transaction(async (tx) => {
  await tx.user.update({ ... });
  const chat = await tx.chat.findUnique({ where: { id } });
});
```

◊
**结果**：A 等 User，B 等 Chat → 死锁

**解决**：按固定顺序访问资源

```typescript
// 总是先 User，再 Chat
```

---

## Part 2: 游标分页

### Offset 分页的问题

**当前分页方式**：

```typescript
// 第1页
await prisma.message.findMany({
  skip: 0,
  take: 50,
});

// 第2页
await prisma.message.findMany({
  skip: 50,
  take: 50,
});

// 第100页
await prisma.message.findMany({
  skip: 5000, // 问题：需要扫描并丢弃 5000 条
  take: 50,
});
```

**性能曲线**：

```
第1页:   ~5ms
第10页:  ~20ms
第100页: ~200ms
第1000页: ~2000ms
```

**为什么越来越慢**：

- 数据库必须读取前 N 条记录
- 然后丢弃掉，只返回后面的
- N 越大，开销越大

### 游标分页原理

**核心思想**：记住"上次看到哪了"，下次从那继续

```typescript
// 第1页（没有游标）
await prisma.message.findMany({
  where: { chatId },
  orderBy: { createdAt: "desc", id: "desc" },
  take: 50,
});

// 返回 50 条，最后一条是：
// { id: 'msg_51', createdAt: '2024-01-09T10:00:00Z' }

// 第2页（用最后一条作为游标）
await prisma.message.findMany({
  where: {
    chatId,
    createdAt: { lt: "2024-01-09T10:00:00Z" }, // 早于游标时间
    OR: [
      {
        createdAt: { equals: "2024-01-09T10:00:00Z" },
        id: { lt: "msg_51" }, // 同时间，ID 小于游标
      },
    ],
  },
  orderBy: { createdAt: "desc", id: "desc" },
  take: 50,
});
```

**为什么快**：

- 数据库直接用索引定位
- 不需要扫描前面的记录
- 性能是 O(log n) 而不是 O(n)

### 游标编码

**问题**：游标包含两个值（时间 + ID），怎么传给前端？

**解决**：编码成一个字符串

```typescript
// 编码
const cursor = {
  createdAt: "2024-01-09T10:00:00Z",
  id: "msg_51",
};
const encoded = Buffer.from(JSON.stringify(cursor)).toString("base64url");
// 结果: "eyJjcmVhdGVkQXQiOiIiLCJpZCI6Im1zZ181MSJ9"

// 解码
const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString());
```

### 复合排序键

**为什么需要 ID 作为第二排序**？

```typescript
// 只有 createdAt 的问题：
// 如果多条消息有相同时间，排序不稳定
orderBy: {
  createdAt: "desc";
}

// 正确做法：复合排序
orderBy: [
  { createdAt: "desc" },
  { id: "desc" }, // 时间相同时，用 ID 排序
];
```

**对应的 WHERE 条件**：

```typescript
where: {
  OR: [
    { createdAt: { lt: cursorDate } },  // 时间更早的
    {
      createdAt: { equals: cursorDate },  // 时间相同
      id: { lt: cursorId }  // ID 更小的
    },
  ],
}
```

### 前端无限滚动

```typescript
// 使用自定义 Hook
const { items, loadMore, hasMore, observerTarget } = useInfiniteScroll(
  async (cursor) => {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`/api/chats?${params}`);
    return await res.json();
  }
);

// 渲染
return (
  <div>
    {items.map(item => <Item key={item.id} data={item} />)}

    {hasMore && (
      <div ref={observerTarget}>Loading...</div>
    )}
  </div>
);
```

---

## Part 3: 最佳实践

### 事务最佳实践

1. **事务要短**
   - 只包含必要的数据库操作
   - 外部调用放在事务外

2. **按固定顺序访问资源**
   - 避免死锁
   - 例如：总是先 User，再 Chat

3. **使用批量操作**
   - `updateMany` 比 循环 `update` 好
   - 减少事务时间

### 游标分页最佳实践

1. **复合排序键**
   - 主排序字段 + 唯一键
   - 确保排序稳定

2. **索引优化**

   ```sql
   CREATE INDEX ON "Message"("chatId", "createdAt" DESC, "id" DESC);
   ```

3. **前端处理边界**
   - 没有更多数据时隐藏加载按钮
   - 显示加载状态
   - 错误处理

---

## Part 4: 常见问题

### Q: 事务失败后，数据会怎样？

A: **全部回滚**，就像什么都没发生过。

```typescript
try {
  await prisma.$transaction(async (tx) => {
    await tx.user.create({ ... });
    await tx.chat.create({ ... });
    throw new Error('Oops');
  });
} catch (e) {
  // User 和 Chat 都不会被创建
}
```

### Q: 游标分页能跳到指定页吗？

A: **不能**，这是它的"缺点"。

| 方式   | 能跳页  | 性能 | 场景               |
| ------ | ------- | ---- | ------------------ |
| Offset | ✅ 能   | 慢   | 后台管理、小数据量 |
| Cursor | ❌ 不能 | 快   | 无限滚动、大数据量 |

### Q: 什么时候用事务，什么时候不用？

A: **需要原子性的时候用**：

需要事务：

- 创建关联实体（Chat + Message）
- 状态转移（Guest → User）
- 库存扣减

不需要事务：

- 单条记录操作
- 只读查询
- 可以容忍短暂不一致的操作

---

## Part 5: 你应该记住的代码片段

### 事务模板

```typescript
await prisma.$transaction(async (tx) => {
  // 所有数据库操作用 tx
  await tx.someModel.create({ ... });
  await tx.someModel.update({ ... });
});
```

### 游标分页模板

```typescript
// 服务端
const items = await prisma.model.findMany({
  where: {
    ...(cursor && {
      OR: [
        { createdAt: { lt: cursorDate } },
        { createdAt: { equals: cursorDate }, id: { lt: cursorId } },
      ],
    }),
  },
  orderBy: { createdAt: 'desc', id: 'desc' },
  take: limit + 1,
});

// 返回
{
  items: items.slice(0, limit),
  nextCursor: items.length > limit ? encode(lastItem) : null,
  hasMore: items.length > limit,
}
```

### 前端无限滚动模板

```typescript
const { items, loadMore, hasMore, observerTarget } = useInfiniteScroll(fetchFn);

return (
  <>
    {items.map(item => <Item key={item.id} {...item} />)}
    <div ref={observerTarget}>{hasMore && 'Loading...'}</div>
  </>
);
```

---

## 文件变更清单

### 新增文件

**事务**:

- `src/server/shared/database/transaction.ts`
- `src/server/shared/database/transaction.test.ts`

**游标分页**:

- `src/server/shared/pagination/cursor.ts`
- `src/server/shared/pagination/cursor.test.ts`
- `src/server/chat/chat-pagination.ts`
- `src/server/chat/message-pagination.ts`

**前端**:

- `src/hooks/use-infinite-scroll.ts`

### 修改文件

- `src/server/chat/chat-service.ts` - 创建 Chat+Message 改用事务
- `src/server/guest/guest-service.ts` - Guest 合并改用事务
- `src/server/auth/auth-service.ts` - 改密码改用事务
- `src/app/api/chats/route.ts` - 改用游标分页
- `src/app/api/chat/[id]/messages/route.ts` - 改用游标分页
- `src/components/chat-list.tsx` - 支持无限滚动
- `prisma/schema.prisma` - 新增索引

---

## 对应文档

- 设计文档: `docs/superpowers/specs/2026-04-11-database-transactions-pagination-design.md`
- 实现计划: `docs/superpowers/plans/2026-04-11-database-transactions-pagination-implementation.md`
- 后端学习地图: `docs/superpowers/specs/2026-04-10-backend-learning-map-for-ai-engineer.md`

---

## Part 6: 实现总结与经验

### 实际实现的关键决策

#### 1. 事务工具函数设计

创建了 `withTransaction` 工具函数，但最终在 auth-service 中直接使用 `prisma.$transaction`：

```typescript
// src/server/shared/database/transaction.ts
export async function withTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number; // 等待事务的最长时间（默认 5s）
    timeout?: number; // 事务执行超时（默认 10s）
  },
): Promise<T> {
  return await prisma.$transaction(callback, {
    maxWait: options?.maxWait ?? 5000,
    timeout: options?.timeout ?? 10000,
  });
}
```

**原因**：Repository 层没有支持事务客户端参数，直接使用 `prisma.$transaction` 更简洁。

#### 2. 游标分页的核心实现

使用时间戳 + ID 的复合排序键，通过 OR 条件处理边界：

```typescript
// DESC 排序的游标条件
where: {
  OR: [
    { createdAt: { lt: cursorDate } },  // 时间更早的
    { createdAt: cursorDate, id: { lt: cursorId } },  // 时间相同但 ID 更小的
  ],
}
```

**关键点**：

- 多取一条记录 (`take: limit + 1`) 用于判断是否有更多数据
- 最后一条记录作为下一页的游标
- 使用 base64url 编码游标，避免特殊字符问题

#### 3. 测试策略

**单元测试**：使用 vi.hoisted 和 vi.mock 模拟依赖

```typescript
const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
```

**集成测试**：需要真实数据库，但受限于环境配置，本项目主要使用单元测试。

### 测试覆盖

- `transaction.test.ts`: 4 个单元测试
- `cursor.test.ts`: 21 个测试（编码/解码/往返）
- `pagination.test.ts`: 14 个测试（分页逻辑）
- `chat-repository.pagination.test.ts`: 5 个测试（API 层）

**总计**: 271 个测试全部通过

### 后续可以改进的地方

1. **Repository 层事务支持**
   - 修改 repository 函数接受可选的 `tx` 参数
   - 允许在事务内外复用同一套代码

2. **集成测试自动化**
   - 设置测试数据库
   - 在 CI 中运行集成测试

3. **前端无限滚动**
   - 创建 `useInfiniteScroll` hook
   - 使用 Intersection Observer API
   - 添加加载状态和错误处理

4. **性能监控**
   - 添加事务耗时日志
   - 监控慢查询
