/**
 * Worker 专用的队列客户端
 *
 * 直接使用 Worker 专用的数据库访问层，避免 server-only 依赖
 */

import type { Job, JobStatus, JobType } from "../queue-types";
import { getNextJobForWorker, updateJobForWorker } from "./queue-repository";
import {
  redisQueueOperations,
  calculateRetryDelay,
} from "../redis-queue-operations";

/**
 * Worker 专用的队列接口
 */
export class WorkerQueueClient {
  /**
   * 从队列获取下一个待处理任务
   * Worker 直接从数据库轮询，不依赖 Redis
   */
  async dequeue(types?: JobType[], timeout: number = 1): Promise<Job | null> {
    // 先尝试从 Redis 获取
    const jobId = await redisQueueOperations.popJobId(types ?? [], timeout);

    if (jobId) {
      // 从数据库读取完整 Job
      const job = await this.getJobById(jobId);
      if (job) {
        return job;
      }
      // 如果 Job 不存在于数据库（已被删除），继续轮询
    }

    // Redis 没有任务或不可用，直接从数据库获取
    const job = await getNextJobForWorker(types ?? [], "PENDING");

    if (!job) {
      // 没有 PENDING 任务，检查是否有可重试的任务
      // （availableAt 已过的 RETRYABLE 任务）
      const retryableJob = await getNextJobForWorker(types ?? [], "RETRYABLE" as JobStatus);
      return retryableJob;
    }

    return job;
  }

  /**
   * 更新任务状态
   */
  async updateStatus(
    id: string,
    status: JobStatus,
    update?: {
      result?: unknown;
      errorMessage?: string;
      attempts?: number;
      availableAt?: Date;
      startedAt?: Date;
      completedAt?: Date;
      failedAt?: Date;
    },
  ): Promise<void> {
    await updateJobForWorker(id, status, update);

    // 如果任务变成可重试状态，需要重新放回 Redis 队列
    if (status === "RETRYABLE") {
      // 获取 Job 类型
      const job = await this.getJobById(id);
      if (job) {
        await redisQueueOperations.requeueJobId(id, job.type);
      }
    }
  }

  /**
   * 计算重试延迟
   */
  calculateRetryDelay(attempt: number): number {
    return calculateRetryDelay(attempt);
  }

  /**
   * 获取任务详情（内部辅助方法）
   */
  async getJobById(id: string): Promise<Job | null> {
    // 直接查询数据库
    const { workerGetJobById } = await import("./queue-repository");
    return workerGetJobById(id);
  }
}

/**
 * Worker 队列客户端实例
 */
export const workerQueueClient = new WorkerQueueClient();
