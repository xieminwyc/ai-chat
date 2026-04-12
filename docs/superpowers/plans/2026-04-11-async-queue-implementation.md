# 异步任务队列实现计划

## 文档概览

| 项目     | 内容                                                      |
| -------- | --------------------------------------------------------- |
| 计划主题 | 异步任务队列实现计划                                      |
| 参考设计 | `docs/superpowers/specs/2026-04-11-async-queue-design.md` |
| 预计工期 | 4 天                                                      |
| 当前状态 | 待开始                                                    |

## 实现原则

1. **先基础设施后业务** - 先建队列框架，再迁移邮件发送
2. **TDD 优先** - 每个模块先写测试
3. **小步提交** - 每个 Phase 完成后可运行
4. **渐进迁移** - 新旧系统并存，逐步切换

## Phase 1: 数据模型与基础设施（Day 1）

### 目标

创建 Job 表和队列基础设施

### 任务清单

#### Task 1.1: 创建 Job 模型

```bash
# 文件: prisma/schema.prisma

model Job {
  id            String    @id @default(uuid())
  type          JobType
  status        JobStatus @default(PENDING)
  payload       Json
  result        Json?
  errorMessage  String?   @db.Text
  attempts      Int       @default(0)
  maxAttempts   Int       @default(3)
  availableAt   DateTime  @default(now())
  startedAt     DateTime?
  completedAt   DateTime?
  failedAt      DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime    @updatedAt

  @@index([status])
  @@index([availableAt])
}

enum JobType {
  SEND_VERIFICATION_EMAIL
  SEND_PASSWORD_RESET_EMAIL
}

enum JobStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  RETRYABLE
  CANCELLED
}
```

#### Task 1.2: 执行迁移

```bash
APP_ENV=local node scripts/env.mjs npx prisma migrate dev --name add_job_table
```

#### Task 1.3: 创建类型定义

```typescript
// src/server/queue/queue-types.ts
export type JobType = "SEND_VERIFICATION_EMAIL" | "SEND_PASSWORD_RESET_EMAIL";
export type JobStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "RETRYABLE"
  | "CANCELLED";

export interface CreateJobInput {
  type: JobType;
  payload: unknown;
  maxAttempts?: number;
  availableAt?: Date;
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  payload: unknown;
  result: unknown | null;
  errorMessage: string | null;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueClient {
  enqueue(input: CreateJobInput): Promise<Job>;
  dequeue(types?: JobType[]): Promise<Job | null>;
  updateStatus(
    id: string,
    status: JobStatus,
    update?: JobUpdate,
  ): Promise<void>;
  getJob(id: string): Promise<Job | null>;
}

export interface JobUpdate {
  result?: unknown;
  errorMessage?: string;
  attempts?: number;
  availableAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
}

export interface JobHandler<TInput = unknown, TResult = unknown> {
  readonly type: JobType;
  handle(input: TInput): Promise<TResult>;
}
```

#### Task 1.4: 实现 Repository 层

```typescript
// src/server/queue/queue-repository.ts
import { prisma } from "@/lib/prisma";

export async function createJob(input: CreateJobInput): Promise<Job> {
  return await prisma.job.create({
    data: {
      type: input.type,
      payload: input.payload as any,
      maxAttempts: input.maxAttempts ?? 3,
      availableAt: input.availableAt ?? new Date(),
    },
  });
}

export async function getJobById(id: string): Promise<Job | null> {
  return await prisma.job.findUnique({ where: { id } });
}

export async function getNextJob(types: JobType[]): Promise<Job | null> {
  return await prisma.job.findFirst({
    where: {
      type: { in: types },
      status: "PENDING",
      availableAt: { lte: new Date() },
    },
    orderBy: { availableAt: "asc" },
  });
}

export async function updateJob(
  id: string,
  status: JobStatus,
  update?: JobUpdate,
): Promise<Job> {
  return await prisma.job.update({
    where: { id },
    data: {
      status,
      ...(update && {
        result: update.result as any,
        errorMessage: update.errorMessage,
        attempts: update.attempts,
        availableAt: update.availableAt,
        startedAt: update.startedAt,
        completedAt: update.completedAt,
        failedAt: update.failedAt,
      }),
    },
  });
}
```

#### Task 1.5: 实现 Redis 队列客户端

```typescript
// src/server/queue/redis-queue-client.ts
import { getRedisClient } from "@/lib/redis";
import {
  createJob,
  getJobById,
  getNextJob,
  updateJob,
  type CreateJobInput,
  type Job,
  type JobStatus,
  type JobUpdate,
  type JobType,
} from "./queue-repository";

const QUEUE_PREFIX = "queue";
const getQueueKey = (type: JobType) => `${QUEUE_PREFIX}:${type}`;

export class RedisQueueClient {
  async enqueue(input: CreateJobInput): Promise<Job> {
    // 1. 创建 Job 记录
    const job = await createJob(input);

    // 2. 添加到 Redis 队列
    const redis = getRedisClient();
    if (redis) {
      await redis.lpush(getQueueKey(input.type), job.id);
    }

    return job;
  }

  async dequeue(types?: JobType[]): Promise<Job | null> {
    const redis = getRedisClient();
    if (!redis) {
      // Fallback: 直接从数据库获取
      return await getNextJob(types ?? []);
    }

    // 从 Redis 队列阻塞式获取
    const keys = types ? types.map(getQueueKey) : null;
    const result = keys
      ? await redis.brpop(...keys, "1")
      : await redis.brpop(keys ?? Object.values(JobType).map(getQueueKey), "1");

    if (!result) return null;

    const [, jobId] = result;
    return await getJobById(jobId);
  }

  async updateStatus(
    id: string,
    status: JobStatus,
    update?: JobUpdate,
  ): Promise<void> {
    await updateJob(id, status, update);
  }

  async getJob(id: string): Promise<Job | null> {
    return await getJobById(id);
  }
}

export const queueClient = new RedisQueueClient();
```

### 验证命令

```bash
# 类型检查
npm run build

# Prisma 生成
npx prisma generate
```

---

## Phase 2: Worker 运行时与邮件 Handler（Day 2）

### 目标

实现 Worker 处理器和邮件发送任务

### 任务清单

#### Task 2.1: 实现 Worker 运行时

```typescript
// src/server/queue/worker/worker-runner.ts
import { queueClient, type JobHandler, type JobType } from "./queue-types";

export class WorkerRunner {
  private isRunning = false;
  private pollInterval = 1000;
  private handlers = new Map<JobType, JobHandler>();

  register(handler: JobHandler): void {
    this.handlers.set(handler.type, handler);
  }

  async start(): Promise<void> {
    this.isRunning = true;
    console.log("[Worker] Starting...");

    while (this.isRunning) {
      try {
        const types = Array.from(this.handlers.keys());
        const job = await queueClient.dequeue(types);

        if (!job) {
          await this.sleep(this.pollInterval);
          continue;
        }

        await this.processJob(job);
      } catch (error) {
        console.error("[Worker] Error:", error);
        await this.sleep(this.pollInterval);
      }
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    console.log("[Worker] Stopped...");
  }

  private async processJob(job: Job): Promise<void> {
    console.log(`[Worker] Processing job ${job.id} (${job.type})`);

    // 更新为 RUNNING
    await queueClient.updateStatus(job.id, "RUNNING", {
      startedAt: new Date(),
    });

    try {
      const handler = this.handlers.get(job.type);
      if (!handler) {
        throw new Error(`No handler for: ${job.type}`);
      }

      const result = await handler.handle(job.payload);

      // 标记完成
      await queueClient.updateStatus(job.id, "COMPLETED", {
        result,
        completedAt: new Date(),
      });

      console.log(`[Worker] Job ${job.id} completed`);
    } catch (error) {
      // 处理失败（可能重试）
      await this.handleFailure(job, error);
    }
  }

  private async handleFailure(job: Job, error: unknown): Promise<void> {
    const shouldRetry = job.attempts < job.maxAttempts;

    if (shouldRetry) {
      const delay = this.calculateRetryDelay(job.attempts);
      const availableAt = new Date(Date.now() + delay);

      await queueClient.updateStatus(job.id, "RETRYABLE", {
        attempts: job.attempts + 1,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        availableAt,
      });

      console.log(`[Worker] Job ${job.id} failed, retrying in ${delay}ms`);
    } else {
      await queueClient.updateStatus(job.id, "FAILED", {
        errorMessage: `Failed after ${job.attempts} attempts`,
        failedAt: new Date(),
      });

      console.log(`[Worker] Job ${job.id} failed permanently`);
    }
  }

  private calculateRetryDelay(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt), 60000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

#### Task 2.2: 实现邮件 Handler

```typescript
// src/server/queue/worker/handlers/email-handler.ts
import { resend } from "@/lib/resend";
import type { JobHandler } from "../../queue-types";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailJobHandler implements JobHandler<SendEmailInput, void> {
  readonly type = "SEND_VERIFICATION_EMAIL" as const;

  async handle(input: SendEmailInput): Promise<void> {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }
}

// 密码重置邮件 Handler
export class PasswordResetEmailHandler implements JobHandler<
  SendEmailInput,
  void
> {
  readonly type = "SEND_PASSWORD_RESET_EMAIL" as const;

  async handle(input: SendEmailInput): Promise<void> {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }
}
```

#### Task 2.3: 创建 Worker 启动脚本

```typescript
// scripts/worker.ts
import { WorkerRunner } from "@/server/queue/worker/worker-runner";
import {
  EmailJobHandler,
  PasswordResetEmailHandler,
} from "@/server/queue/worker/handlers/email-handler";

const runner = new WorkerRunner();

// 注册 Handlers
runner.register(new EmailJobHandler());
runner.register(new PasswordResetEmailHandler());

// 启动
runner.start().catch(console.error);

// 优雅退出
process.on("SIGINT", async () => {
  console.log("\n[Worker] Shutting down...");
  await runner.stop();
  process.exit(0);
});
```

#### Task 2.4: 更新 package.json

```json
{
  "scripts": {
    "worker": "APP_ENV=local node scripts/env.mjs tsx scripts/worker.ts"
  }
}
```

#### Task 2.5: 添加 tsx 依赖

```bash
npm install --save-dev tsx
```

### 验证命令

```bash
# 启动 Worker（应该看到 Starting... 消息）
npm run worker

# 手动创建测试任务
# 应该看到 Worker 处理日志
```

---

## Phase 3: 迁移邮件发送到队列（Day 3）

### 目标

将现有邮件发送改为异步队列模式

### 任务清单

#### Task 3.1: 创建队列服务

```typescript
// src/server/queue/queue-service.ts
import { queueClient } from "./redis-queue-client";
import type { CreateJobInput, JobType } from "./queue-types";

export async function enqueueJob<T = unknown>(
  type: JobType,
  payload: T,
  options?: { maxAttempts?: number; delay?: number },
): Promise<void> {
  const availableAt = options?.delay
    ? new Date(Date.now() + options.delay)
    : undefined;

  await queueClient.enqueue({
    type,
    payload,
    maxAttempts: options?.maxAttempts,
    availableAt,
  });
}
```

#### Task 3.2: 迁移验证邮件发送

```typescript
// src/server/auth/email-delivery.ts

// 原来:
import { resend } from '@/lib/resend';
export async function sendVerificationEmail(email: string, token: string) {
  await resend.emails.send({ ... });
}

// 现在:
import { enqueueJob } from '@/server/queue/queue-service';
export async function sendVerificationEmail(email: string, token: string) {
  await enqueueJob('SEND_VERIFICATION_EMAIL', {
    to: email,
    subject: '验证你的邮箱',
    html: renderVerificationEmail(token),
  });
}
```

#### Task 3.3: 迁移密码重置邮件

```typescript
// src/server/auth/email-delivery.ts

export async function sendPasswordResetEmail(email: string, token: string) {
  await enqueueJob("SEND_PASSWORD_RESET_EMAIL", {
    to: email,
    subject: "重置你的密码",
    html: renderPasswordResetEmail(token),
  });
}
```

#### Task 3.4: 更新测试

```typescript
// 测试中需要 mock 队列
vi.mock("@/server/queue/queue-service", () => ({
  enqueueJob: vi.fn(),
}));
```

### 验证命令

```bash
# 终端1: 启动 Worker
npm run worker

# 终端2: 启动开发服务器
npm run dev

# 测试: 注册新用户，检查 Worker 日志
```

---

## Phase 4: 管理接口与文档（Day 4）

### 目标

添加任务管理接口和完善文档

### 任务清单

#### Task 4.1: 查询任务状态 API

```typescript
// src/app/api/admin/jobs/[id]/route.ts
import { queueClient } from "@/server/queue/redis-queue-client";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const job = await queueClient.getJob(params.id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}
```

#### Task 4.2: 重试失败任务 API

```typescript
// src/app/api/admin/jobs/[id]/retry/route.ts
import { queueClient } from "@/server/queue/redis-queue-client";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const job = await queueClient.getJob(params.id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // 重置为 PENDING
  await queueClient.updateStatus(params.id, "PENDING", {
    attempts: 0,
    errorMessage: null,
    availableAt: new Date(),
  });

  return NextResponse.json({ jobId: job.id, status: "PENDING" });
}
```

#### Task 4.3: 更新 docker-compose.yml

```yaml
services:
  worker:
    build: .
    command: npm run worker
    env_file: .env.production
    depends_on:
      - redis
    restart: unless-stopped
```

#### Task 4.4: 更新文档

- 更新 CLAUDE.md 添加队列章节
- 更新 progress.md
- 写学习笔记

### 验证命令

```bash
# 全量测试
npm test

# 构建
npm run build

# Lint
npm run lint
```

---

## 学习总结

### 学到的后端能力

1. **生产者-消费者模式**
   - 任务解耦
   - 削峰填谷
   - 异步处理

2. **重试与容错**
   - 指数退避算法
   - 最大重试次数
   - 死信处理

3. **可观察性**
   - 任务状态追踪
   - 执行日志
   - 失败原因记录

### 后续升级路径

```
Redis List → Bull/BullMQ → RabbitMQ → Kafka
```

### 可扩展场景

- 图片处理
- Webhook 回调
- 报表生成
- 数据导入/导出
