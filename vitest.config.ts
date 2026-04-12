import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // 这个仓库会在根目录下挂 .worktrees，用来承载隔离开发分支。
    // 主工作区跑测试时要明确排除这些副本，避免同一份测试被执行两遍。
    exclude: ["**/.worktrees/**", "**/node_modules/**", "**/dist/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Mock server-only 模块（Next.js 特有，测试环境中不需要）
      "server-only": path.resolve(__dirname, "./vitest.mocks/server-only.ts"),
    },
  },
});
