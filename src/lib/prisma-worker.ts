/**
 * Worker 专用的 Prisma 客户端
 *
 * 这个文件不依赖 server-only，可以被独立 worker 脚本使用
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Prisma 7 在 PostgreSQL 上需要显式提供 driver adapter
const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });

// Worker 是长期运行的进程，缓存 Prisma 实例
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
