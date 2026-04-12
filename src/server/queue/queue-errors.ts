/**
 * 队列错误基类
 */
export class QueueError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "QueueError";
  }
}

/**
 * 任务处理器未找到错误
 */
export class HandlerNotFoundError extends QueueError {
  constructor(type: string) {
    super(`No handler registered for job type: ${type}`, "HANDLER_NOT_FOUND");
    this.name = "HandlerNotFoundError";
  }
}

/**
 * 任务已失败错误
 */
export class JobFailedError extends QueueError {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly originalError?: Error,
  ) {
    super(message, "JOB_FAILED");
    this.name = "JobFailedError";
  }
}

/**
 * 任务超时错误
 */
export class JobTimeoutError extends QueueError {
  constructor(jobId: string, timeout: number) {
    super(
      `Job ${jobId} exceeded timeout of ${timeout}ms`,
      "JOB_TIMEOUT",
    );
    this.name = "JobTimeoutError";
  }
}

/**
 * 无效任务状态错误
 */
export class InvalidJobStatusError extends QueueError {
  constructor(currentStatus: string, expectedStatus: string) {
    super(
      `Invalid job status: expected ${expectedStatus}, got ${currentStatus}`,
      "INVALID_JOB_STATUS",
    );
    this.name = "InvalidJobStatusError";
  }
}

/**
 * 队列已关闭错误
 */
export class QueueClosedError extends QueueError {
  constructor() {
    super("Queue is closed and not accepting new jobs", "QUEUE_CLOSED");
    this.name = "QueueClosedError";
  }
}
