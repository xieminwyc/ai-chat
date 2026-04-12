/**
 * 任务类型枚举
 */
export type JobType = "SEND_VERIFICATION_EMAIL" | "SEND_PASSWORD_RESET_EMAIL";

/**
 * 任务状态枚举
 */
export type JobStatus =
  | "PENDING" // 等待执行
  | "RUNNING" // 执行中
  | "COMPLETED" // 成功完成
  | "FAILED" // 失败（不再重试）
  | "RETRYABLE" // 失败但可重试
  | "CANCELLED"; // 已取消

/**
 * 创建任务输入
 */
export interface CreateJobInput {
  type: JobType;
  payload: unknown;
  maxAttempts?: number;
  availableAt?: Date;
}

/**
 * 任务数据模型
 */
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

/**
 * 任务更新数据
 */
export interface JobUpdate {
  result?: unknown;
  errorMessage?: string;
  attempts?: number;
  availableAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
}

/**
 * 队列客户端接口
 */
export interface QueueClient {
  /**
   * 添加任务到队列
   */
  enqueue(input: CreateJobInput): Promise<Job>;

  /**
   * 从队列获取下一个待处理任务
   * @param types 任务类型列表，不传则获取所有类型
   * @param timeout 超时时间（秒）
   */
  dequeue(types?: JobType[], timeout?: number): Promise<Job | null>;

  /**
   * 更新任务状态
   */
  updateStatus(
    id: string,
    status: JobStatus,
    update?: JobUpdate,
  ): Promise<void>;

  /**
   * 获取任务详情
   */
  getJob(id: string): Promise<Job | null>;
}

/**
 * 任务处理器接口
 */
export interface JobHandler<TInput = unknown, TResult = unknown> {
  /**
   * 任务类型
   */
  readonly type: JobType;

  /**
   * 执行任务
   */
  handle(input: TInput): Promise<TResult>;

  /**
   * 序列化结果（可选）
   */
  serialize?(result: TResult): unknown;

  /**
   * 反序列化结果（可选）
   */
  deserialize?(data: unknown): TResult;
}

/**
 * 队列配置选项
 */
export interface QueueOptions {
  /**
   * Redis 队列前缀
   */
  queuePrefix?: string;

  /**
   * 默认最大重试次数
   */
  defaultMaxAttempts?: number;

  /**
   * 默认重试延迟基数（毫秒）
   */
  defaultRetryDelay?: number;
}

/**
 * 重试延迟计算函数类型
 */
export type RetryDelayCalculator = (attempt: number) => number;
