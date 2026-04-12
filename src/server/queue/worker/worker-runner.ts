import type { Job, JobHandler, JobType } from "../queue-types";
import { HandlerNotFoundError } from "../queue-errors";
import { workerQueueClient } from "./queue-client";

/**
 * Worker 运行时配置
 */
export interface WorkerRunnerOptions {
  /**
   * 轮询间隔（毫秒）
   * 当 dequeue 返回 null 时等待的时间
   */
  pollInterval?: number;

  /**
   * dequeue 超时时间（秒）
   */
  dequeueTimeout?: number;

  /**
   * 是否在启动时输出日志
   */
  verbose?: boolean;
}

/**
 * Worker 运行时
 *
 * 负责从队列中获取任务并执行
 */
export class WorkerRunner {
  private isRunning = false;
  private handlers = new Map<JobType, JobHandler>();
  private pollInterval: number;
  private dequeueTimeout: number;
  private verbose: boolean;

  constructor(options?: WorkerRunnerOptions) {
    this.pollInterval = options?.pollInterval ?? 1000;
    this.dequeueTimeout = options?.dequeueTimeout ?? 1;
    this.verbose = options?.verbose ?? true;
  }

  /**
   * 注册任务处理器
   */
  register(handler: JobHandler): void {
    if (this.verbose) {
      console.log(`[Worker] Registered handler for: ${handler.type}`);
    }
    this.handlers.set(handler.type, handler);
  }

  /**
   * 批量注册任务处理器
   */
  registerAll(handlers: JobHandler[]): void {
    for (const handler of handlers) {
      this.register(handler);
    }
  }

  /**
   * 获取已注册的任务类型
   */
  getRegisteredTypes(): JobType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * 启动 Worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn("[Worker] Already running");
      return;
    }

    this.isRunning = true;
    console.log(`[Worker] Starting with ${this.handlers.size} handlers...`);

    const types = this.getRegisteredTypes();
    if (types.length === 0) {
      console.warn("[Worker] No handlers registered!");
    }

    while (this.isRunning) {
      try {
        await this.poll();
      } catch (error) {
        console.error("[Worker] Error in poll loop:", error);
        await this.sleep(this.pollInterval);
      }
    }

    console.log("[Worker] Stopped");
  }

  /**
   * 停止 Worker
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log("[Worker] Shutting down...");
    this.isRunning = false;
  }

  /**
   * 单次轮询
   */
  private async poll(): Promise<void> {
    const types = this.getRegisteredTypes();

    if (types.length === 0) {
      await this.sleep(this.pollInterval);
      return;
    }

    // 从队列获取任务
    const job = await workerQueueClient.dequeue(types, this.dequeueTimeout);

    if (!job) {
      // 没有任务，等待一下
      console.log(`[Worker] No jobs found, waiting ${this.pollInterval}ms...`);
      await this.sleep(this.pollInterval);
      return;
    }

    // 处理任务
    await this.processJob(job);
  }

  /**
   * 处理单个任务
   */
  private async processJob(job: Job): Promise<void> {
    const jobId = job.id.substring(0, 8); // 只显示前 8 位

    console.log(`[Worker] Processing job ${jobId} (${job.type})`);

    // 1. 更新为 RUNNING
    try {
      await workerQueueClient.updateStatus(job.id, "RUNNING", {
        startedAt: new Date(),
      });
    } catch (error) {
      console.error(`[Worker] Failed to update job ${jobId} to RUNNING:`, error);
      return;
    }

    // 2. 获取 Handler
    const handler = this.handlers.get(job.type);
    if (!handler) {
      const error = new HandlerNotFoundError(job.type);
      await this.handleFailure(job, error);
      return;
    }

    // 3. 执行 Handler
    try {
      const result = await handler.handle(job.payload);

      // 4. 标记完成
      await workerQueueClient.updateStatus(job.id, "COMPLETED", {
        result,
        completedAt: new Date(),
      });

      console.log(`[Worker] Job ${jobId} completed`);
    } catch (error) {
      // 5. 处理失败（可能重试）
      await this.handleFailure(job, error);
    }
  }

  /**
   * 处理任务失败
   */
  private async handleFailure(job: Job, error: unknown): Promise<void> {
    const jobId = job.id.substring(0, 8);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    const shouldRetry = job.attempts < job.maxAttempts;

    if (shouldRetry) {
      const delay = workerQueueClient.calculateRetryDelay(job.attempts);
      const availableAt = new Date(Date.now() + delay);

      await workerQueueClient.updateStatus(job.id, "RETRYABLE", {
        attempts: job.attempts + 1,
        errorMessage,
        availableAt,
      });

      console.log(
        `[Worker] Job ${jobId} failed (attempt ${job.attempts + 1}/${job.maxAttempts}), ` +
          `retrying in ${delay}ms: ${errorMessage}`,
      );
    } else {
      await workerQueueClient.updateStatus(job.id, "FAILED", {
        errorMessage: `Failed after ${job.attempts} attempts: ${errorMessage}`,
        failedAt: new Date(),
      });

      console.error(
        `[Worker] Job ${jobId} failed permanently after ${job.attempts} attempts: ${errorMessage}`,
      );
    }
  }

  /**
   * 睡眠指定时间
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
