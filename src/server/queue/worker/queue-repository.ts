/**
 * Worker 专用的队列数据访问层
 *
 * 这个文件不依赖 server-only，专门给 Worker 使用
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type {
  Job,
  JobType,
  JobStatus,
  JobUpdate,
} from "../queue-types";

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });

// Worker 环境的 Prisma 客户端
const workerPrisma = new PrismaClient({
  adapter,
  log: ["error", "warn"],
});

/**
 * 根据 ID 获取任务
 */
export async function workerGetJobById(id: string): Promise<Job | null> {
  const job = await workerPrisma.job.findUnique({
    where: { id },
  });

  if (!job) {
    return null;
  }

  return mapDbJobToJob(job);
}

/**
 * 从数据库获取下一个待处理任务
 */
export async function getNextJobForWorker(
  types: JobType[],
  status: JobStatus = "PENDING",
): Promise<Job | null> {
  const job = await workerPrisma.job.findFirst({
    where: {
      type: { in: types },
      status,
      availableAt: { lte: new Date() },
    },
    orderBy: { availableAt: "asc" },
  });

  if (!job) {
    return null;
  }

  return mapDbJobToJob(job);
}

/**
 * 更新任务状态
 */
export async function updateJobForWorker(
  id: string,
  status: JobStatus,
  update?: JobUpdate,
): Promise<Job> {
  const job = await workerPrisma.job.update({
    where: { id },
    data: {
      status,
      ...(update && {
        result:
          update.result === null
            ? Prisma.JsonNull
            : (update.result as Prisma.InputJsonValue),
        errorMessage: update.errorMessage,
        attempts: update.attempts,
        availableAt: update.availableAt,
        startedAt: update.startedAt,
        completedAt: update.completedAt,
        failedAt: update.failedAt,
      }),
    },
  });

  return mapDbJobToJob(job);
}

/**
 * 将数据库 Job 映射为业务层 Job
 */
function mapDbJobToJob(dbJob: {
  id: string;
  type: string;
  status: string;
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
}): Job {
  return {
    id: dbJob.id,
    type: dbJob.type as JobType,
    status: dbJob.status as JobStatus,
    payload: dbJob.payload,
    result: dbJob.result,
    errorMessage: dbJob.errorMessage,
    attempts: dbJob.attempts,
    maxAttempts: dbJob.maxAttempts,
    availableAt: dbJob.availableAt,
    startedAt: dbJob.startedAt,
    completedAt: dbJob.completedAt,
    failedAt: dbJob.failedAt,
    createdAt: dbJob.createdAt,
    updatedAt: dbJob.updatedAt,
  };
}
