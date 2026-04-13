# Agent Loop 后端设计文档

## 文档概览

| 项目 | 内容 |
| --- | --- |
| 文档主题 | AI Chat 项目 Agent Loop / Tool Calling 后端设计 |
| 面向对象 | 项目 owner、后端学习者 |
| 当前阶段 | 设计版 |
| 目标仓库 | `AI Chat` |

## 背景

当前项目已具备：
- 完整的用户认证体系
- 聊天消息持久化
- 流式响应

下一阶段目标是实现最小 Agent 能力：
- 模型可调用工具
- 记录工具调用过程
- 可追踪运行状态

## 核心目标

从"AI Chat"升级到"AI Agent"的最小可用后端：

1. **数据层**: `AgentRun` / `ToolCall` 表设计
2. **服务层**: Agent 执行引擎、工具注册机制
3. **接口层**: 启动/查询 Agent Run 的 API
4. **错误处理**: 工具失败的优雅降级

## 数据模型设计

### AgentRun 表

记录一次 Agent 运行的完整过程：

```prisma
model AgentRun {
  id            String    @id @default(uuid())
  chatId        String
  chat          Chat      @relation(fields: [chatId], references: [id], onDelete: Cascade)
  userId        String?

  // 运行状态
  status        AgentRunStatus @default(PENDING)

  // 输入
  userMessage   String    @db.Text

  // 模型相关
  model         String
  provider      String    @default("siliconflow")

  // 最终输出
  finalAnswer   String?   @db.Text

  // 时间追踪
  startedAt     DateTime  @default(now())
  completedAt   DateTime?
  failedAt      DateTime?

  // 工具调用
  toolCalls     ToolCall[]

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([chatId])
  @@index([userId])
  @@index([status])
}

enum AgentRunStatus {
  PENDING      // 初始状态
  RUNNING      // 执行中
  COMPLETED    // 成功完成
  FAILED       // 失败
  PARTIAL      // 部分工具失败，但有最终答案
}
```

### ToolCall 表

记录单次工具调用：

```prisma
model ToolCall {
  id            String      @id @default(uuid())
  agentRunId    String
  agentRun      AgentRun    @relation(fields: [agentRunId], references: [id], onDelete: Cascade)

  // 工具信息
  toolName      String
  toolArgs      Json        // 工具输入参数

  // 执行结果
  status        ToolCallStatus @default(PENDING)
  result        Json?       // 工具返回结果
  errorMessage  String?     @db.Text

  // 时间追踪
  startedAt     DateTime?
  completedAt   DateTime?
  failedAt      DateTime?

  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  @@index([agentRunId])
  @@index([toolName])
  @@index([status])
}

enum ToolCallStatus {
  PENDING      // 等待执行
  RUNNING      // 执行中
  SUCCEEDED    // 成功
  FAILED       // 失败
  SKIPPED      // 被跳过
}
```

### 关联关系

```
Chat
  └─→ AgentRun[] (一次对话可能有多次 agent run)
       └─→ ToolCall[] (一次 run 可能有多个工具调用)
```

## 服务层设计

### 目录结构

```
src/server/agent/
├── agent-types.ts         // 类型定义
├── agent-repository.ts    // 数据访问
├── agent-service.ts       // 业务逻辑
├── agent-errors.ts        // 错误类
├── agent-schemas.ts       // Zod 校验
├── tools/
│   ├── tool-registry.ts   // 工具注册表
│   ├── base-tool.ts       // 工具基类/接口
│   └── get-time-tool.ts   // 示例工具
└── agent-executor.ts      // Agent 执行引擎
```

### 工具接口设计

```typescript
// tools/base-tool.ts

export interface ToolInput {
  name: string;
  description: string;
  parameters: object; // JSON Schema
}

export interface Tool {
  readonly name: string;
  readonly description: string;

  // 参数校验 Schema
  readonly parametersSchema: object;

  // 执行工具
  execute(input: unknown): Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}
```

### 工具注册表

```typescript
// tools/tool-registry.ts

class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  listAll(): ToolInput[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parametersSchema,
    }));
  }
}

export const toolRegistry = new ToolRegistry();
```

### Agent 执行流程

```typescript
// agent-executor.ts

async function executeAgentRun(input: {
  chatId: string;
  userId: string | null;
  guestSessionId: string | null;
  userMessage: string;
}): Promise<string> {

  // 1. 创建 AgentRun 记录
  const agentRun = await createAgentRun(input);

  try {
    // 2. 调用模型，获取工具调用决策
    const modelResponse = await callLLM({
      messages: buildMessages(input),
      tools: toolRegistry.listAll(),
    });

    // 3. 如果模型要求调用工具
    if (modelResponse.toolCalls) {
      for (const toolCall of modelResponse.toolCalls) {
        // 4. 记录工具调用
        const call = await createToolCall(agentRun.id, toolCall);

        try {
          // 5. 执行工具
          const tool = toolRegistry.get(toolCall.name);
          if (!tool) throw new Error(`Tool not found: ${toolCall.name}`);

          const result = await tool.execute(toolCall.arguments);

          // 6. 记录成功结果
          await updateToolCallSuccess(call.id, result);

        } catch (error) {
          // 7. 记录失败
          await updateToolCallFailed(call.id, error);
        }
      }

      // 8. 将工具结果回灌给模型，获取最终答案
      const finalResponse = await callLLM({
        messages: buildMessagesWithToolResults(input, modelResponse, toolCallResults),
      });

      // 9. 更新最终状态
      await completeAgentRun(agentRun.id, finalResponse.content);

      return finalResponse.content;
    }

    // 没有工具调用，直接返回模型回答
    await completeAgentRun(agentRun.id, modelResponse.content);
    return modelResponse.content;

  } catch (error) {
    // 10. 整体失败处理
    await failAgentRun(agentRun.id, error);
    throw error;
  }
}
```

## API 接口设计

### 启动 Agent Run

```
POST /api/agent/run

Request:
{
  "chatId": string,
  "message": string
}

Response:
{
  "agentRunId": string,
  "status": "RUNNING",
  "stream": ReadableStream  // 流式输出
}
```

### 查询 Agent Run 状态

```
GET /api/agent/runs/:id

Response:
{
  "id": string,
  "status": AgentRunStatus,
  "userMessage": string,
  "finalAnswer": string | null,
  "toolCalls": [
    {
      "id": string,
      "toolName": string,
      "status": ToolCallStatus,
      "result": unknown | null,
      "errorMessage": string | null
    }
  ],
  "startedAt": string,
  "completedAt": string | null
}
```

### 获取可用工具列表

```
GET /api/agent/tools

Response:
{
  "tools": [
    {
      "name": "get_time",
      "description": "获取当前时间",
      "parameters": { ... }
    }
  ]
}
```

## 错误处理策略

### 错误分类

```typescript
// agent-errors.ts

class AgentError extends AppError {
  constructor(message: string, public readonly code: string) {
    super(message, 'AGENT_ERROR');
  }
}

class ToolNotFoundError extends AgentError {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, 'TOOL_NOT_FOUND');
  }
}

class ToolExecutionError extends AgentError {
  constructor(toolName: string, originalError: Error) {
    super(`Tool execution failed: ${toolName}`, 'TOOL_EXECUTION_ERROR');
  }
}

class InvalidToolArgumentsError extends AgentError {
  constructor(toolName: string, issues: string[]) {
    super(`Invalid arguments for ${toolName}: ${issues.join(', ')}`, 'INVALID_ARGUMENTS');
  }
}
```

### 降级策略

1. **单个工具失败**: 记录失败状态，继续执行其他工具
2. **全部工具失败**: 返回错误信息给模型，让模型决定如何回复
3. **模型调用失败**: 标记 AgentRun 为 FAILED，返回友好错误

## 第一个工具：get_time

```typescript
// tools/get-time-tool.ts

import { z } from 'zod';
import { Tool, ToolResult } from './base-tool';

const GetTimeInputSchema = z.object({
  timezone: z.string().optional().default('Asia/Shanghai'),
});

export class GetTimeTool implements Tool {
  readonly name = 'get_time';
  readonly description = '获取指定时区的当前时间';

  readonly parametersSchema = {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: '时区，如 Asia/Shanghai',
        default: 'Asia/Shanghai',
      },
    },
  };

  async execute(input: unknown): Promise<ToolResult> {
    // 1. 参数校验
    const parsed = GetTimeInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: 'INVALID_ARGUMENTS',
          message: parsed.error.errors.map(e => e.message).join(', '),
        },
      };
    }

    try {
      // 2. 执行逻辑
      const now = new Date();
      const formatted = now.toLocaleString('zh-CN', {
        timeZone: parsed.data.timezone,
      });

      return {
        success: true,
        data: {
          timezone: parsed.data.timezone,
          datetime: formatted,
          timestamp: now.getTime(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}

// 注册工具
toolRegistry.register(new GetTimeTool());
```

## 学习重点

这一阶段重点练的后端能力：

1. **数据建模**
   - 状态机设计 (AgentRunStatus, ToolCallStatus)
   - 关联关系设计
   - 时间追踪字段

2. **服务层设计**
   - 工具注册模式
   - 执行流程编排
   - 错误处理与降级

3. **输入验证**
   - Zod Schema 校验
   - JSON Schema 生成
   - 错误信息聚合

4. **异步状态管理**
   - PENDING → RUNNING → COMPLETED/FAILED
   - 事务边界设计

## 文件清单

### 新增文件

**数据模型**:
- `prisma/migrations/xxx_add_agent_run_and_tool_call/`
- `prisma/schema.prisma` (更新)

**服务层**:
- `src/server/agent/agent-types.ts`
- `src/server/agent/agent-repository.ts`
- `src/server/agent/agent-repository.test.ts`
- `src/server/agent/agent-service.ts`
- `src/server/agent/agent-service.test.ts`
- `src/server/agent/agent-errors.ts`
- `src/server/agent/agent-schemas.ts`
- `src/server/agent/agent-executor.ts`
- `src/server/agent/agent-executor.test.ts`

**工具系统**:
- `src/server/agent/tools/base-tool.ts`
- `src/server/agent/tools/tool-registry.ts`
- `src/server/agent/tools/get-time-tool.ts`
- `src/server/agent/tools/get-time-tool.test.ts`

**API 层**:
- `src/app/api/agent/run/route.ts`
- `src/app/api/agent/run/route.test.ts`
- `src/app/api/agent/runs/[id]/route.ts`
- `src/app/api/agent/tools/route.ts`

### 修改文件

- `src/server/chat/chat-service.ts` (集成 agent)
- `src/lib/prisma.ts` (可能需要调整)

## 对应文档

- 实现计划: `docs/superpowers/plans/2026-04-11-agent-loop-backend-implementation.md`
- 路线图: `docs/project-notes/2026-03-25-fullstack-ai-agent-roadmap.md`
- 后端学习地图: `docs/superpowers/specs/2026-04-10-backend-learning-map-for-ai-engineer.md`
