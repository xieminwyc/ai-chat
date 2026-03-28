import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Prisma 7 在 PostgreSQL 上需要显式提供 driver adapter。
// 这里把项目的 DATABASE_URL 交给 pg adapter，后面 PrismaClient 会通过它连数据库。
const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });

// 在 Next.js 开发模式下，文件热更新会反复重新执行模块。
// 把 prisma 挂到 globalThis 上，可以避免每次热更新都新建一个数据库客户端。
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // 所有 route.ts 里的 prisma.chat / prisma.message 调用，底层都通过这个实例访问 PostgreSQL。
    adapter,
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  // 只在开发环境缓存，生产环境一般按请求生命周期正常创建即可。
  globalForPrisma.prisma = prisma;
}
