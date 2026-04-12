import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

/**
 * 在事务中执行回调函数
 * @param callback 事务回调函数，接收 tx 对象
 * @param options 事务选项（超时、最大等待时间）
 * @returns 回调函数的返回值
 */
export async function withTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;  // 等待事务的最长时间（默认 5s）
    timeout?: number;  // 事务执行超时（默认 10s）
  }
): Promise<T> {
  return await prisma.$transaction(callback, {
    maxWait: options?.maxWait ?? 5000,
    timeout: options?.timeout ?? 10000,
  });
}

/**
 * 带重试的事务（用于处理可重试的错误，如死锁）
 * @param callback 事务回调函数
 * @param maxRetries 最大重试次数（默认 3 次）
 * @returns 回调函数的返回值
 */
export async function withRetryableTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await prisma.$transaction(callback);
    } catch (error) {
      lastError = error as Error;

      // 检查是否是可重试的错误
      const isError = error instanceof Error && 'code' in error;
      if (!isError) {
        throw error;
      }

      const errorCode = (error as { code: string }).code;

      // P2034: 连接错误（可能是死锁导致）
      const isRetryable = errorCode === 'P2034';

      if (!isRetryable || i === maxRetries) {
        throw error;
      }

      // 指数退避
      const delay = 100 * Math.pow(2, i);
      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
