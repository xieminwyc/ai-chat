/**
 * Worker 启动脚本
 *
 * 运行方式：
 *   npm run worker
 *
 * 环境变量：
 *   APP_ENV - 环境类型（local/test/production）
 */

import { WorkerRunner } from "@/server/queue/worker/worker-runner";
import {
  VerificationEmailHandler,
  PasswordResetEmailHandler,
} from "@/server/queue/worker/handlers/email-handler";

// 验证环境变量
const resendKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM_EMAIL;
console.log(`[Worker] RESEND_API_KEY: ${resendKey ? `${resendKey.slice(0, 8)}...` : 'MISSING'}`);
console.log(`[Worker] RESEND_FROM_EMAIL: ${resendFrom || 'MISSING'}`);

if (!resendKey || !resendFrom) {
  console.error('[Worker] ERROR: Resend environment variables not set!');
}

// 创建 Worker 实例
const runner = new WorkerRunner({
  pollInterval: 1000, // 1 秒轮询一次
  dequeueTimeout: 1, // 1 秒超时
  verbose: true,
});

// 注册任务处理器
runner.register(new VerificationEmailHandler());
runner.register(new PasswordResetEmailHandler());

// 启动 Worker
runner.start().catch((error) => {
  console.error("[Worker] Failed to start:", error);
  process.exit(1);
});

// 优雅退出
async function shutdown(signal: string) {
  console.log(`\n[Worker] Received ${signal}, shutting down gracefully...`);
  await runner.stop();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// 未捕获的错误处理
process.on("uncaughtException", (error) => {
  console.error("[Worker] Uncaught exception:", error);
  shutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason) => {
  console.error("[Worker] Unhandled rejection:", reason);
  shutdown("UNHANDLED_REJECTION");
});
