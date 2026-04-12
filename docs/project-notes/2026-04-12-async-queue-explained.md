# 异步任务队列 - 图文详解

> 用通俗的方式理解你即将实现的队列系统

---

## 目录

1. [什么是队列？为什么要用？](#1-什么是队列为什么要用)
2. [队列的核心概念](#2-队列的核心概念)
3. [生产者-消费者模式](#3-生产者-消费者模式)
4. [Redis 队列实现原理](#4-redis-队列实现原理)
5. [重试与指数退避](#5-重试与指数退避)
6. [你的项目如何落地](#6-你的项目如何落地)

---

## 1. 什么是队列？为什么要用？

### 生活类比：餐厅点餐

```
❌ 没有队列（同步）
顾客点餐 → 厨房做菜 → 端给顾客 → 下一位顾客
问题：每个顾客要等前面的人做完菜才能点餐

✅ 有队列（异步）
顾客点餐 → 拿号码牌 → 找位置坐 → 厨房按号码做菜 → 叫号取餐
优点：点餐快，厨房按自己的节奏处理
```

### 代码对比

```typescript
// ❌ 同步发送邮件（当前项目）
POST /api/auth/register
  │
  ├─ 创建用户 (100ms)
  ├─ 发送验证邮件 (2000ms) ← 阻塞！用户要等 2 秒
  └─ 返回响应

用户感知：注册好慢啊...

// ✅ 异步发送邮件（改造后）
POST /api/auth/register
  │
  ├─ 创建用户 (100ms)
  ├─ 把邮件任务扔进队列 (5ms) ← 立刻返回！
  └─ 返回响应

用户感知：秒注册！

后台：Worker 慢慢发邮件，用户不用等
```

### 队列解决的四大问题

| 问题 | 没有队列 | 有队列 |
|------|----------|--------|
| **响应慢** | 长任务阻塞请求 | 立即返回，后台处理 |
| **失败丢失** | 发送失败就丢了 | 自动重试 |
| **流量冲击** | 并发高就崩 | 队列缓冲，慢慢处理 |
| **耦合严重** | 邮件挂了，注册也挂 | 邮件挂了，任务还在，恢复后继续发 |

---

## 2. 队列的核心概念

### Job（任务）

一条"待办事项"，包含：

```typescript
Job {
  id: "job-123"
  type: "SEND_VERIFICATION_EMAIL"    ← 任务类型
  status: "PENDING"                   ← 当前状态
  payload: {                          ← 执行所需数据
    to: "user@example.com",
    subject: "验证邮箱",
    html: "<p>点击验证...</p>"
  }
  attempts: 0                         ← 已试次数
  maxAttempts: 3                      ← 最多试几次
  createdAt: "2024-01-01T00:00:00Z"
}
```

### 状态流转

```
     ┌─────────────────────────────────────────────────┐
     │                   Job 生命周期                  │
     └─────────────────────────────────────────────────┘

     创建任务
        │
        ▼
  ┌─────────┐
  │ PENDING │ ← 等待执行
  └────┬────┘
       │ 被 Worker 取出
       ▼
  ┌─────────┐
  │ RUNNING │ ← 正在执行
  └────┬────┘
       │
   ┌───┴────┬──────────┐
   ▼        ▼          ▼
成功      失败(可重试)  失败(放弃)
   │        │          │
   ▼        ▼          ▼
COMPLETED RETRYABLE   FAILED
   │        │
   │        └───▶ PENDING (延迟后)
   │
   └─── 结束
```

---

## 3. 生产者-消费者模式

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                       生产者端                          │
│  (API 服务器 - 处理用户请求)                             │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ enqueue
                     ▼
┌─────────────────────────────────────────────────────────┐
│                      队列                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Job 1 │ Job 2 │ Job 3 │ Job 4 │ ...            │   │
│  └─────────────────────────────────────────────────┘   │
│            Redis List / 数据库                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ dequeue
                     ▼
┌─────────────────────────────────────────────────────────┐
│                       消费者端                          │
│  (Worker - 后台任务处理器)                              │
│                                                         │
│  while (true) {                                        │
│    job = queue.dequeue()                               │
│    processJob(job)  ← 执行具体任务                     │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
```

### 通信解耦

```
生产者不需要知道：
- 谁来处理任务
- 什么时候处理
- 处理得怎么样

消费者不需要知道：
- 谁创建的任务
- 为什么要创建

两者只通过"队列"这个中间人交流
```

---

## 4. Redis 队列实现原理

### Redis List 数据结构

```bash
# LPUSH - 从左边插入（生产者）
LPUSH queue:emails "job-1"
LPUSH queue:emails "job-2"

# 队列状态: [job-2, job-1]

# RPOP / BRPOP - 从右边取出（消费者）
BRPOP queue:emails 1  ← 阻塞 1 秒等待
# 返回: ["queue:emails", "job-1"]
# 剩余: [job-2]

# BRPOP 阻塞式获取 - 没有任务就等
# 轮询时不会疯狂刷数据库，节省资源
```

### 为什么同时用 Redis + 数据库？

```
┌─────────────────────────────────────────────────────────┐
│                     为什么双存储？                      │
└─────────────────────────────────────────────────────────┘

Redis:          数据库:
├─ 快速存取      ├─ 持久化存储
├─ 阻塞式获取    ├─ 完整 Job 数据
└─ 队列功能      ├─ 状态追踪
                  └─ 历史查询

完整流程：
1. 生产者: 创建 Job 到数据库 → LPUSH job.id 到 Redis
2. 消费者: BRPOP 从 Redis 获取 job.id → 从数据库读完整 Job
```

### 为什么不用数据库直接做队列？

```sql
-- ❌ 纯数据库队列
SELECT * FROM jobs WHERE status = 'PENDING' ORDER BY createdAt LIMIT 1

问题：
1. 轮询频繁 - 每秒查数据库，压力大
2. 并发竞争 - 多个 Worker 可能抢到同一条
3. 无阻塞 - 空了也一直查，浪费资源

-- ✅ Redis + 数据库
BRPOP queue:emails 1  ← 阻塞等待，不空才返回

优点：
1. 高性能 - 内存操作，极快
2. 并发安全 - 天然支持
3. 阻塞式 - 没任务就等，不空转
```

---

## 5. 重试与指数退避

### 为什么需要重试？

```
真实世界的失败：
- 邮件服务器暂时不可用
- 网络抖动
- API 限流

不能一失败就放弃！需要重试
```

### 指数退避算法

```
第 1 次失败 → 等 1 秒   (2^0 × 1000ms)
第 2 次失败 → 等 2 秒   (2^1 × 1000ms)
第 3 次失败 → 等 4 秒   (2^2 × 1000ms)
第 4 次失败 → 等 8 秒   (2^3 × 1000ms)
...

上限 60 秒

为什么指数级增长？
- 失败后可能还是不能立即恢复
- 给系统喘息时间
- 避免雪崩
```

### 代码实现

```typescript
function calculateRetryDelay(attempt: number): number {
  // 1秒 → 2秒 → 4秒 → 8秒 → ... → 最多60秒
  return Math.min(1000 * Math.pow(2, attempt), 60000);
}

// 使用
const delay = calculateRetryDelay(job.attempts);
const availableAt = new Date(Date.now() + delay);

// 更新 Job，设置下次可执行时间
await queue.updateStatus(job.id, "RETRYABLE", {
  attempts: job.attempts + 1,
  availableAt,
});
```

### 重试流程图

```
Job 执行失败
      │
      ▼
 attempts < maxAttempts?
      │
  ┌───┴───┐
  是       否
  │        │
  ▼        ▼
RETRYABLE  FAILED
  │        (永久失败，记录错误)
  │
  ▼
计算延迟时间
  │
  ▼
availableAt = now + delay
  │
  ▼
Worker 会跳过，直到时间到了
  │
  ▼
时间到 → 变成 PENDING
  │
  ▼
重新执行
```

---

## 6. 你的项目如何落地

### 改造前后对比

```
┌─────────────────────────────────────────────────────────┐
│                      改造前                             │
└─────────────────────────────────────────────────────────┘

注册流程：
用户提交 → 创建用户 → 发邮件(2秒) → 返回响应
                              ↑
                        同步阻塞！

┌─────────────────────────────────────────────────────────┐
│                      改造后                             │
└─────────────────────────────────────────────────────────┘

注册流程：
用户提交 → 创建用户 → 扔进队列(5ms) → 返回响应
                          ↓
                     后台 Worker
                          ↓
                     发邮件(2秒)
                          ↓
                     完成
```

### 目录结构

```
src/server/queue/
├── queue-types.ts           ← 类型定义
├── queue-repository.ts      ← 数据库操作
├── queue-service.ts         ← 业务逻辑
├── redis-queue-client.ts    ← Redis 队列操作
├── queue-errors.ts          ← 错误类
├── worker/
│   ├── worker-runner.ts     ← Worker 运行时
│   └── handlers/
│       ├── email-handler.ts ← 邮件处理器
│       └── ...              ← 未来扩展
└── cli.ts                   ← 命令行入口
```

### 启动方式

```bash
# 开发环境 - 两个终端

# 终端1: API 服务器
npm run dev

# 终端2: Worker（后台处理器）
npm run worker

# 生产环境 - Docker
docker-compose up
# ├── ai-chat (API)
# ├── worker (后台任务)
# ├── redis
# └── postgres
```

### 邮件发送改造

```typescript
// src/server/auth/email-delivery.ts

// 改造前：同步发送
import { resend } from '@/lib/resend';

export async function sendVerificationEmail(email: string, token: string) {
  await resend.emails.send({ ... });  // 阻塞 2 秒
}

// 改造后：异步队列
import { enqueueJob } from '@/server/queue/queue-service';

export async function sendVerificationEmail(email: string, token: string) {
  await enqueueJob('SEND_VERIFICATION_EMAIL', {
    to: email,
    subject: '验证邮箱',
    html: renderEmail(token),
  });
  // 5 毫秒返回！
}
```

### Worker 怎么知道处理什么？

```typescript
// scripts/worker.ts

const runner = new WorkerRunner();

// 注册 Handler 告诉 Worker 怎么处理每种任务
runner.register(new VerificationEmailHandler());     // 处理验证邮件
runner.register(new PasswordResetEmailHandler());    // 处理重置邮件
// 未来扩展：
// runner.register(new ImageProcessHandler());
// runner.register(new ReportGeneratorHandler());

runner.start();
```

---

## 总结：队列的核心价值

```
          ┌─────────────────────────────────┐
          │          核心价值               │
          └─────────────────────────────────┘

1. 解耦
   生产者不依赖消费者
   邮件服务挂了，注册功能不受影响

2. 异步
   长任务不阻塞用户请求
   提升用户体验

3. 缓冲
   流量高峰时任务堆积
   低谷时慢慢处理

4. 可靠
   失败自动重试
   任务不丢失
   可追踪执行状态
```

### 学习路径

```
你现在: Redis List + 数据库
  ↓
下一步: BullMQ (专业 Redis 队列库)
  ├── 延迟任务
  ├── 优先级
  ├── 去重
  └── 调度面板
  ↓
进阶: RabbitMQ
  ├── 消息确认机制
  ├── 多种交换机模式
  └── 集群支持
  ↓
终极: Kafka
  ├── 高吞吐
  ├── 持久化日志
  └── 分布式流处理
```

---

## 快速参考

| 命令 | 操作 |
|------|------|
| `LPUSH key value` | 入队（生产者） |
| `BRPOP key timeout` | 出队（消费者，阻塞） |
| `RPOP key` | 出队（非阻塞） |

| 状态 | 含义 |
|------|------|
| PENDING | 等待执行 |
| RUNNING | 执行中 |
| COMPLETED | 成功完成 |
| RETRYABLE | 失败，等待重试 |
| FAILED | 永久失败 |

| 文件 | 职责 |
|------|------|
| `redis-queue-client.ts` | Redis 队列操作 |
| `queue-repository.ts` | 数据库 CRUD |
| `worker-runner.ts` | Worker 运行时 |
| `email-handler.ts` | 邮件任务处理器 |
