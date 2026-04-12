/**
 * Redis 队列客户端 (Next.js API 版本)
 *
 * 使用 Redis 操作和数据库仓库的组合
 * 只在 Next.js 环境中使用（API 路由）
 */

import type {
  CreateJobInput,
  Job,
  JobStatus,
  JobType,
  JobUpdate,
  QueueClient,
} from "./queue-types";
import {
  createJob,
  getJobById,
  updateJob,
} from "./queue-repository";
import {
  redisQueueOperations,
  calculateRetryDelay,
} from "./redis-queue-operations";

/**
 * Redis 队列客户端实现
 *
 * 架构：
 * 1. enqueue: 写数据库 → LPUSH job.id 到 Redis
 * 2. dequeue: BRPOP 从 Redis 获取 job.id → 从数据库读完整 Job
 */
export class RedisQueueClient implements QueueClient {
  private queuePrefix: string;

  constructor(options?: { queuePrefix?: string }) {
    this.queuePrefix = options?.queuePrefix ?? "queue";
  }

  /**
   * 添加任务到队列
   */
  async enqueue(input: CreateJobInput): Promise<Job> {
    // 1. 先创建 Job 记录到数据库
    const job = await createJob(input);

    console.log(`[QueueClient] Job created: ${job.id} (type: ${job.type})`);

    // 2. 添加到 Redis 队列
    await redisQueueOperations.pushJobId(job.id, input.type);

    return job;
  }

  /**
   * 从队列获取下一个待处理任务
   * 注意：这个方法主要用于 Next.js 环境，Worker 使用自己的实现
   */
  async dequeue(types?: JobType[], timeout: number = 1): Promise<Job | null> {
    // 从 Redis 获取 Job ID
    const jobId = await redisQueueOperations.popJobId(types ?? [], timeout);

    if (!jobId) {
      return null;
    }

    // 从数据库读取完整 Job
    return await getJobById(jobId);
  }

  /**
   * 更新任务状态
   */
  async updateStatus(
    id: string,
    status: JobStatus,
    update?: JobUpdate,
  ): Promise<void> {
    await updateJob(id, status, update);

    // 如果任务变成可重试状态，需要重新放回队列
    if (status === "RETRYABLE") {
      const job = await getJobById(id);
      if (job) {
        await redisQueueOperations.requeueJobId(id, job.type);
      }
    }
  }

  /**
   * 获取任务详情
   */
  async getJob(id: string): Promise<Job | null> {
    return await getJobById(id);
  }

  /**
   * 获取队列长度
   */
  async getQueueLength(type: JobType): Promise<number> {
    return await redisQueueOperations.getQueueLength(type);
  }

  /**
   * 计算重试延迟
   */
  calculateRetryDelay(attempt: number): number {
    return calculateRetryDelay(attempt);
  }
}

/**
 * 默认队列客户端实例（供 Next.js API 使用）
 */
export const queueClient = new RedisQueueClient();
