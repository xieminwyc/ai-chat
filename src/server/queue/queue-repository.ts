// 队列系统的数据库访问层
// 在 Next.js 环境中使用默认 prisma（带 server-only 优化）
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

import type {
  CreateJobInput,
  Job,
  JobStatus,
  JobType,
  JobUpdate,
} from "./queue-types";

/**
 * 创建任务
 */
export async function createJob(input: CreateJobInput): Promise<Job> {
  const job = await prisma.job.create({
    data: {
      type: input.type,
      payload: input.payload as Prisma.InputJsonValue,
      maxAttempts: input.maxAttempts ?? 3,
      availableAt: input.availableAt ?? new Date(),
    },
  });

  return mapDbJobToJob(job);
}

/**
 * 根据 ID 获取任务
 */
export async function getJobById(id: string): Promise<Job | null> {
  const job = await prisma.job.findUnique({
    where: { id },
  });

  return job ? mapDbJobToJob(job) : null;
}

/**
 * 获取下一个待处理任务
 */
export async function getNextJob(
  types: JobType[],
  status: JobStatus = "PENDING",
): Promise<Job | null> {
  const job = await prisma.job.findFirst({
    where: {
      type: { in: types },
      status,
      availableAt: { lte: new Date() },
    },
    orderBy: { availableAt: "asc" },
  });

  return job ? mapDbJobToJob(job) : null;
}

/**
 * 更新任务
 */
export async function updateJob(
  id: string,
  status: JobStatus,
  update?: JobUpdate,
): Promise<Job> {
  const job = await prisma.job.update({
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
 * 获取失败的任务列表
 */
export async function getFailedJobs(limit = 50): Promise<Job[]> {
  const jobs = await prisma.job.findMany({
    where: {
      status: "FAILED",
    },
    orderBy: { failedAt: "desc" },
    take: limit,
  });

  return jobs.map(mapDbJobToJob);
}

/**
 * 获取可重试的任务列表
 */
export async function getRetryableJobs(limit = 50): Promise<Job[]> {
  const jobs = await prisma.job.findMany({
    where: {
      status: "RETRYABLE",
      availableAt: { lte: new Date() },
    },
    orderBy: { availableAt: "asc" },
    take: limit,
  });

  return jobs.map(mapDbJobToJob);
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

// 导出 Prisma 中的类型，供测试使用
export type { Job as PrismaJob, JobType, JobStatus } from "@prisma/client";
