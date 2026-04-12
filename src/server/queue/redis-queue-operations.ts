/**
 * Redis 队列客户端
 *
 * 只负责 Redis 操作，数据库操作由调用者处理
 * 这样可以避免 server-only 依赖问题
 */

import { getRedisClient, type RedisClientLike } from "@/lib/redis";
import type { JobType } from "./queue-types";

/**
 * 默认队列配置
 */
const DEFAULT_QUEUE_PREFIX = "queue";
const DEFAULT_DEQUEUE_TIMEOUT = 1; // 1秒

/**
 * 获取队列的 Redis key
 */
export function getQueueKey(type: JobType, prefix: string = DEFAULT_QUEUE_PREFIX): string {
  return `${prefix}:${type}`;
}

/**
 * Redis 队列操作（只操作 Redis，不涉及数据库）
 */
export class RedisQueueOperations {
  private redis: RedisClientLike | null;
  private redisAvailable: boolean = true;
  private connectionReady: Promise<void> | null = null;
  private queuePrefix: string;

  constructor(options?: { redis?: RedisClientLike | null; queuePrefix?: string }) {
    this.redis = options?.redis ?? getRedisClient();
    this.queuePrefix = options?.queuePrefix ?? DEFAULT_QUEUE_PREFIX;
    this.redisAvailable = this.redis !== null;

    // 等待 Redis 连接就绪
    if (this.redis && 'status' in this.redis) {
      const redis = this.redis as { status: string; on?: (event: string, fn: () => void) => void };
      this.connectionReady = new Promise((resolve) => {
        if (redis.status === 'ready') {
          resolve();
          return;
        }
        redis.on?.('ready', () => resolve());
        if (!redis.on) {
          resolve();
        }
      });
    }
  }

  /**
   * 添加 Job ID 到 Redis 队列
   */
  async pushJobId(jobId: string, type: JobType): Promise<void> {
    if (this.redis && this.redisAvailable) {
      const queueKey = getQueueKey(type, this.queuePrefix);
      try {
        await this.redis.lpush(queueKey, jobId);
        console.log(`[RedisQueue] Job ${jobId} pushed to queue: ${queueKey}`);
      } catch (error) {
        this.redisAvailable = false;
        console.error(`[RedisQueue] Failed to push job:`, error instanceof Error ? error.message : error);
      }
    } else {
      console.log(`[RedisQueue] Redis not available, job ID not pushed to queue`);
    }
  }

  /**
   * 从 Redis 队列获取 Job ID
   */
  async popJobId(types: JobType[], timeout: number = DEFAULT_DEQUEUE_TIMEOUT): Promise<string | null> {
    if (!this.redis || !this.redisAvailable) {
      return null;
    }

    // 等待连接就绪
    if (this.connectionReady) {
      await this.connectionReady;
    }

    const queueKeys = types.map((type) => getQueueKey(type, this.queuePrefix));

    try {
      let jobId: string | null = null;

      // 动态构建参数
      const brpopMethod = this.redis.brpop.bind(this.redis) as unknown as (
        ...args: (string | number)[]
      ) => Promise<readonly [key: string, value: string] | null>;

      const result = await brpopMethod(...queueKeys, String(timeout));

      if (result) {
        // result 是 [key, value]
        jobId = result[1];
      }

      return jobId;
    } catch (error) {
      this.redisAvailable = false;
      console.error('[RedisQueue] Failed to pop from Redis:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * 将 Job ID 重新放回队列（用于重试）
   */
  async requeueJobId(jobId: string, type: JobType): Promise<void> {
    if (this.redis && this.redisAvailable) {
      const queueKey = getQueueKey(type, this.queuePrefix);
      try {
        await this.redis.lpush(queueKey, jobId);
      } catch (error) {
        console.error(`[RedisQueue] Failed to requeue job ${jobId}:`, error);
      }
    }
  }

  /**
   * 获取队列长度
   */
  async getQueueLength(type: JobType): Promise<number> {
    if (!this.redis || !this.redisAvailable) {
      return 0;
    }

    try {
      const queueKey = getQueueKey(type, this.queuePrefix);
      const length = await this.redis.llen(queueKey);
      return length ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * 检查 Redis 是否可用
   */
  isAvailable(): boolean {
    return this.redisAvailable;
  }
}

/**
 * 默认 Redis 队列操作实例
 */
export const redisQueueOperations = new RedisQueueOperations();

/**
 * 重试延迟计算（指数退避）
 */
export function calculateRetryDelay(
  attempt: number,
  maxDelay: number = 60000,
  baseDelay: number = 1000,
): number {
  // 指数退避: 2^attempt × baseDelay
  const delay = baseDelay * Math.pow(2, attempt);
  return Math.min(delay, maxDelay);
}
