import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// 加载本地环境变量
config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const userId = "cmnr5dbc5000be7xfp9r10i9i"; // 你的用户ID

const chatTitles = [
  "React 入门学习",
  "TypeScript 类型系统",
  "Next.js 14 新特性",
  "数据库设计原则",
  "RESTful API 设计",
  "Docker 容器化部署",
  "Git 工作流最佳实践",
  "前端性能优化技巧",
  "CSS Grid 布局完全指南",
  "JavaScript 异步编程",
  "Node.js 后端开发",
  "PostgreSQL 数据库操作",
  "Redis 缓存策略",
  "Webpack 打包优化",
  "Vite 构建工具解析",
  "Monorepo 项目架构",
  "微前端实践方案",
  "单元测试最佳实践",
  "E2E 测试自动化",
  "CI/CD 持续集成部署",
  "前端安全防护",
  "WebSocket 实时通信",
  "GraphQL API 设计",
  "Serverless 架构设计",
  "云原生应用开发",
  "代码重构技巧",
  "设计模式在实际项目中的应用",
  "函数式编程思想",
  "响应式编程范式",
  "前端工程化体系",
  "技术选型决策方法",
];

async function seedChats() {
  console.log("开始创建30条聊天记录...");

  // 创建30条聊天，每条间隔1小时
  const now = new Date();
  const chats = [];

  for (let i = 0; i < 30; i++) {
    const updatedAt = new Date(now.getTime() - i * 60 * 60 * 1000); // 每条间隔1小时
    const createdAt = new Date(updatedAt.getTime() - 10 * 60 * 1000); // 创建时间比更新时间早10分钟

    chats.push({
      userId,
      title: chatTitles[i],
      createdAt,
      updatedAt,
    });
  }

  // 批量插入
  await prisma.chat.createMany({
    data: chats,
  });

  console.log("✅ 成功创建30条聊天记录！");

  // 验证结果
  const count = await prisma.chat.count({
    where: { userId },
  });
  console.log(`📊 用户 ${userId} 现在有 ${count} 条聊天记录`);

  await prisma.$disconnect();
}

seedChats().catch((error) => {
  console.error("❌ 错误:", error);
  process.exit(1);
});
