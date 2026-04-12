import { queueClient } from "./redis-queue-client";
import type { JobType } from "./queue-types";

/**
 * 队列服务选项
 */
export interface EnqueueJobOptions {
  /**
   * 最大重试次数
   */
  maxAttempts?: number;

  /**
   * 延迟执行（毫秒）
   */
  delay?: number;
}

/**
 * 将任务加入队列
 *
 * @param type 任务类型
 * @param payload 任务负载
 * @param options 选项
 *
 * @example
 * ```ts
 * await enqueueJob("SEND_VERIFICATION_EMAIL", {
 *   to: "user@example.com",
 *   subject: "验证邮箱",
 *   html: "<p>...</p>"
 * });
 * ```
 */
export async function enqueueJob<T = unknown>(
  type: JobType,
  payload: T,
  options?: EnqueueJobOptions,
): Promise<void> {
  const availableAt = options?.delay
    ? new Date(Date.now() + options.delay)
    : undefined;

  console.log(`[QueueService] Enqueuing job: ${type}`, { payload, availableAt });

  await queueClient.enqueue({
    type,
    payload,
    maxAttempts: options?.maxAttempts,
    availableAt,
  });

  console.log(`[QueueService] Job enqueued successfully`);
}

/**
 * 获取队列统计信息
 */
export async function getQueueStats(type: JobType): Promise<{
  queueLength: number;
}> {
  // 目前只返回队列长度，未来可以扩展更多统计信息
  const queueLength = await (queueClient as { getQueueLength: (t: JobType) => Promise<number> }).getQueueLength(type);

  return { queueLength };
}
