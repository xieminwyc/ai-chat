# 异步任务队列设计文档

## 文档概览

| 项目 | 内容 |
| --- | --- |
| 文档主题 | AI Chat 项目异步任务队列设计 |
| 面向对象 | 项目 owner、后端学习者 |
| 当前阶段 | 设计版 |
| 目标仓库 | `AI Chat` |

## 背景

当前项目已完成：
- ✅ 认证体系（登录、注册、密码重置）
- ✅ Session 管理
- ✅ Redis 缓存与限流

当前邮件发送是同步的：
```
用户请求 → API → 发送邮件 → 返回响应
```

问题：
- 邮件服务慢会阻塞请求
- 发送失败没有重试机制
- 无法控制发送速率
- 长时间任务（如图片处理）会超时

## 核心目标

实现最小可用异步任务队列系统，学习后端通用能力：

1. **任务模型** - Job/Task 的数据建模
2. **队列抽象** - 统一的队列接口
3. **Worker 模式** - 后台任务处理器
4. **重试策略** - 失败重试与退避
5. **可观察性** - 任务状态追踪

## 技术选型

基于当前项目已使用 Redis，采用 **Redis List** 作为队列实现：

**优势**:
- 无需引入新依赖（已有 Redis）
- 学习底层队列原理
- 适合单机/小规模场景
- 可无缝迁移到专业队列系统

**局限**（后续可升级）:
- 没有集群支持
- 没有原生延迟队列
- 没有优先级支持

**后续升级路径**:
```
Redis List → Bull/BullMQ → RabbitMQ → Kafka
```

## 数据模型设计

### Job 表

记录所有异步任务的元数据：

```prisma
model Job {
  id            String    @id @default(uuid())

  // 任务类型与状态
  type          JobType
  status        JobStatus @default(PENDING)

  // 负载（参数）
  payload       Json

  // 执行结果
  result        Json?
  errorMessage  String?   @db.Text

  // 重试控制
  attempts      Int       @default(0)
  maxAttempts   Int       @default(3)

  // 时间追踪
  availableAt   DateTime  @default(now())  // 何时可执行（用于延迟）
  startedAt     DateTime?
  completedAt   DateTime?
  failedAt      DateTime?

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([status])
  @@index([type])
  @@index([availableAt])
}

enum JobType {
  SEND_VERIFICATION_EMAIL
  SEND_PASSWORD_RESET_EMAIL
  // 未来可扩展:
  // PROCESS_IMAGE
  // GENERATE_REPORT
  // WEBHOOK_CALL
}

enum JobStatus {
  PENDING      // 等待执行
  RUNNING      // 执行中
  COMPLETED    // 成功完成
  FAILED       // 失败（不再重试）
  RETRYABLE    // 失败但可重试
  CANCELLED    // 已取消
}
```

## 服务层设计

### 目录结构

```
src/server/queue/
├── queue-types.ts           // 类型定义
├── queue-repository.ts      // 数据访问
├── queue-service.ts         // 业务逻辑
├── queue-errors.ts          // 错误类
├── worker/
│   ├── worker.ts            // Worker 基类
│   ├── worker-runner.ts     // Worker 运行时
│   └── handlers/
│       ├── email-handler.ts // 邮件任务处理器
│       └── handler.ts       // Handler 接口
└── queue-client.ts          // 队列客户端（供业务层调用）
```

### 队列抽象接口

```typescript
// queue-types.ts

export interface QueueClient {
  // 添加任务到队列
  enqueue(job: CreateJobInput): Promise<Job>;

  // 获取下一个待处理任务
  dequeue(types?: JobType[]): Promise<Job | null>;

  // 更新任务状态
  updateStatus(id: string, status: JobStatus, result?: JobUpdate): Promise<void>;

  // 标记任务完成
  complete(id: string, result: unknown): Promise<void>;

  // 标记任务失败
  fail(id: string, error: Error, maxAttempts: number): Promise<void>;
}

export interface JobHandler<TInput = unknown, TResult = unknown> {
  // 任务类型
  readonly type: JobType;

  // 执行任务
  handle(input: TInput): Promise<TResult>;

  // 序列化结果（可选）
  serialize?(result: TResult): unknown;

  // 反序列化结果（可选）
  deserialize?(data: unknown): TResult;
}
```

### Worker 运行机制

```typescript
// worker/worker-runner.ts

class WorkerRunner {
  private isRunning = false;
  private pollInterval = 1000; // 1秒轮询一次

  constructor(
    private queue: QueueClient,
    private handlers: Map<JobType, JobHandler>,
  ) {}

  // 启动 Worker
  async start(): Promise<void> {
    this.isRunning = true;

    while (this.isRunning) {
      try {
        // 1. 从队列获取任务
        const job = await this.queue.dequeue(Array.from(this.handlers.keys()));

        if (!job) {
          await this.sleep(this.pollInterval);
          continue;
        }

        // 2. 执行任务
        await this.processJob(job);

      } catch (error) {
        console.error('[Worker] Error in poll loop:', error);
        await this.sleep(this.pollInterval);
      }
    }
  }

  // 停止 Worker
  async stop(): Promise<void> {
    this.isRunning = false;
  }

  // 处理单个任务
  private async processJob(job: Job): Promise<void> {
    // 1. 更新为 RUNNING
    await this.queue.updateStatus(job.id, 'RUNNING', { startedAt: new Date() });

    try {
      // 2. 获取 Handler
      const handler = this.handlers.get(job.type);
      if (!handler) {
        throw new Error(`No handler for job type: ${job.type}`);
      }

      // 3. 执行 Handler
      const result = await handler.handle(job.payload);

      // 4. 标记完成
      await this.queue.complete(job.id, result);

    } catch (error) {
      // 5. 处理失败（可能重试）
      await this.queue.fail(job.id, error, job.maxAttempts);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 邮件任务处理器

```typescript
// worker/handlers/email-handler.ts

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailHandler implements JobHandler<SendEmailInput, void> {
  readonly type = JobType.SEND_VERIFICATION_EMAIL;

  constructor(
    private emailService: EmailService,
  ) {}

  async handle(input: SendEmailInput): Promise<void> {
    await this.emailService.send({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }
}

// 使用示例
const handler = new EmailHandler(emailService);
handlers.set(JobType.SEND_VERIFICATION_EMAIL, handler);
```

### 业务层调用

```typescript
// 原来: 同步发送邮件
await sendVerificationEmail(user.email, token);

// 现在: 异步加入队列
await queueClient.enqueue({
  type: JobType.SEND_VERIFICATION_EMAIL,
  payload: {
    to: user.email,
    subject: '验证你的邮箱',
    html: renderVerificationEmail(token),
  },
  maxAttempts: 3,
});
```

## 重试策略

### 指数退避

```typescript
function calculateRetryDelay(attempt: number): number {
  // 第1次: 1秒, 第2次: 2秒, 第3次: 4秒, 第4次: 8秒...
  return Math.min(1000 * Math.pow(2, attempt), 60000); // 最多等待1分钟
}

async function retryableFail(queue: QueueClient, job: Job, error: Error): Promise<void> {
  const shouldRetry = job.attempts < job.maxAttempts;

  if (shouldRetry) {
    const delay = calculateRetryDelay(job.attempts);
    const availableAt = new Date(Date.now() + delay);

    await queue.updateStatus(job.id, 'RETRYABLE', {
      attempts: job.attempts + 1,
      errorMessage: error.message,
      availableAt,
    });
  } else {
    await queue.updateStatus(job.id, 'FAILED', {
      errorMessage: `Failed after ${job.attempts} attempts: ${error.message}`,
      failedAt: new Date(),
    });
  }
}
```

## Redis 队列实现

### 数据结构

```typescript
// Redis List 实现
interface RedisQueueClient {
  // LPUSH: 添加任务到队列头部
  enqueue(type: JobType, jobId: string): Promise<void>;

  // BRPOP: 阻塞式从队列尾部取出任务
  dequeue(timeout: number): Promise<{ type: JobType; jobId: string } | null>;

  // 获取所有已注册的队列类型
  getRegisteredTypes(): JobType[];
}

// 队列命名规则
const QUEUE_PREFIX = 'queue';
const getQueueKey = (type: JobType) => `${QUEUE_PREFIX}:${type}`;

// 例如:
// queue:SEND_VERIFICATION_EMAIL
// queue:SEND_PASSWORD_RESET_EMAIL
```

### 完整流程

```
生产者:
  1. 创建 Job 记录到数据库 (status=PENDING)
  2. LPUSH queue:TYPE jobId 到 Redis

消费者 (Worker):
  1. BRPOP 从 Redis 获取任务
  2. 从数据库读取完整 Job
  3. 更新 status=RUNNING
  4. 执行 Handler
  5. 更新 status=COMPLETED/FAILED/RETRYABLE
```

## 部署模式

### 开发环境

```bash
# 终端1: 启动开发服务器
npm run dev

# 终端2: 启动 Worker
npm run worker
```

### 生产环境

```yaml
# docker-compose.yml
services:
  ai-chat:
    # ... 现有配置

  worker:
    build: .
    command: node dist/worker/index.js
    env_file: .env.production
    depends_on:
      - redis
    restart: unless-stopped
```

## API 接口（管理用）

### 查询任务状态

```
GET /api/admin/jobs/:id

Response:
{
  "id": string,
  "type": JobType,
  "status": JobStatus,
  "payload": unknown,
  "result": unknown | null,
  "attempts": number,
  "errorMessage": string | null,
  "createdAt": string,
  "startedAt": string | null,
  "completedAt": string | null,
}
```

### 重试失败任务

```
POST /api/admin/jobs/:id/retry

Response:
{
  "jobId": string,
  "status": "PENDING",
}
```

## 学习重点

这一阶段重点练的后端能力：

1. **异步编程模型**
   - 生产者-消费者模式
   - 任务解耦与削峰
   - 最终一致性

2. **重试与容错**
   - 指数退避算法
   - 最大重试次数
   - 死信队列处理

3. **并发控制**
   - Worker 并发数
   - 任务去重
   - 速率限制

4. **可观察性**
   - 任务状态追踪
   - 失败原因记录
   - 执行时间统计

## 迁移路径

### Phase 1: 邮件异步化

- [ ] 创建 Job 表
- [ ] 实现 Redis 队列客户端
- [ ] 实现 Worker 运行时
- [ ] 实现邮件 Handler
- [ ] 迁移验证邮件发送
- [ ] 迁移密码重置邮件发送

### Phase 2: 增强功能

- [ ] 支持延迟任务
- [ ] 支持任务优先级
- [ ] 实现 Web 管理界面
- [ ] 添加任务统计

### Phase 3: 扩展场景

- [ ] 图片处理 Handler
- [ ] Web 回调 Handler
- [ ] 报表生成 Handler
- [ ] 考虑迁移到 BullMQ

## 文件清单

### 新增文件

**数据模型**:
- `prisma/migrations/xxx_add_job_table/migration.sql`
- `prisma/schema.prisma` (更新)

**服务层**:
- `src/server/queue/queue-types.ts`
- `src/server/queue/queue-repository.ts`
- `src/server/queue/queue-repository.test.ts`
- `src/server/queue/queue-service.ts`
- `src/server/queue/queue-service.test.ts`
- `src/server/queue/queue-errors.ts`
- `src/server/queue/queue-client.ts`

**Worker**:
- `src/server/queue/worker/worker.ts`
- `src/server/queue/worker/worker-runner.ts`
- `src/server/queue/worker/worker-runner.test.ts`
- `src/server/queue/worker/handlers/email-handler.ts`
- `src/server/queue/worker/handlers/email-handler.test.ts`

**CLI**:
- `src/server/queue/cli.ts` (worker 启动入口)
- `scripts/worker.ts` (npm run worker 入口)

### 修改文件

- `package.json` (添加 worker 脚本)
- `src/server/auth/email-delivery.ts` (改为队列模式)
- `src/server/auth/auth-service.ts` (调用队列而非直接发邮件)
- `docker-compose.yml` (添加 worker 服务)

## 对应文档

- 实现计划: `docs/superpowers/plans/2026-04-11-async-queue-implementation.md`
- Redis 设计: `docs/superpowers/specs/2026-04-11-redis-cache-and-rate-limit-design.md`
- 后端学习地图: `docs/superpowers/specs/2026-04-10-backend-learning-map-for-ai-engineer.md`
