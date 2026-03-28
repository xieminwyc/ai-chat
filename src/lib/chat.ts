import OpenAI from "openai";

type ReplyMode = "reply" | "title";

type CreateAssistantReplyOptions = {
  mode?: ReplyMode;
};

type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

const STUDY_ASSISTANT_SYSTEM_PROMPT = `
你是一个耐心、直接、靠谱的前端与全栈学习助手。
你的主要任务是帮助初学者理解 Next.js、React、API、数据库、部署、服务器和 AI 应用开发。

回答要求：
- 默认用简体中文回答
- 先给清晰结论，再补关键解释
- 优先结合真实全栈开发流程来解释
- 不要空泛，不要堆术语
- 尽量给出下一步可执行建议
`.trim();

const siliconFlow = process.env.SILICONFLOW_API_KEY
  ? new OpenAI({
      apiKey: process.env.SILICONFLOW_API_KEY,
      baseURL: process.env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1",
    })
  : null;

function createChatTitle(message: string, normalizedMessage: string) {
  // 标题是会话列表里的“概括版第一句话”，所以尽量比正文回复短很多。
  if (normalizedMessage.includes("next") && normalizedMessage.includes("react")) {
    return "Next.js 和 React";
  }

  if (normalizedMessage.includes("next")) {
    return "Next.js 学习";
  }

  if (normalizedMessage.includes("react")) {
    return "React 学习";
  }

  if (
    normalizedMessage.includes("数据库") ||
    normalizedMessage.includes("postgres") ||
    normalizedMessage.includes("prisma")
  ) {
    return "数据库与 Prisma";
  }

  if (normalizedMessage.includes("接口") || normalizedMessage.includes("api")) {
    return "接口与服务端";
  }

  return message.trim().slice(0, 24) || "新的学习会话";
}

export function createAssistantReply(
  message: string,
  options: CreateAssistantReplyOptions = {},
) {
  const normalizedMessage = message.trim().toLowerCase();

  if (options.mode === "title") {
    return createChatTitle(message, normalizedMessage);
  }

  if (normalizedMessage.includes("你好") || normalizedMessage.includes("hello")) {
    return "你好，我是你的前端/全栈学习助手。我们可以先从页面、接口、数据库这三条线一起学起。";
  }

  if (normalizedMessage.includes("next")) {
    return "Next.js 是基于 React 的全栈框架。你现在最值得先掌握的是页面路由、layout、API 路由和前后端请求链路。";
  }

  if (normalizedMessage.includes("react")) {
    return "React 这一阶段先抓住组件、props、state、事件处理就够了，先别急着把所有 Hook 一次学完。";
  }

  if (
    normalizedMessage.includes("数据库") ||
    normalizedMessage.includes("postgres") ||
    normalizedMessage.includes("prisma")
  ) {
    return "数据库这一阶段建议你先理解表、行、主键、外键，再通过 Prisma 把 chats 和 messages 真的存起来。";
  }

  if (normalizedMessage.includes("接口") || normalizedMessage.includes("api")) {
    return "接口可以先理解成前端和服务端之间的约定入口。你现在最重要的是搞懂 POST /api/chat 收什么、返回什么。";
  }

  return `我是你的学习助手。我收到了“${message}”。如果你暂时不知道学什么，下一步建议继续练 Next.js 路由、接口和 PostgreSQL 持久化。`;
}

export async function streamAssistantReply(messages: ChatHistoryMessage[]) {
  if (!siliconFlow) {
    throw new Error("SILICONFLOW_API_KEY is not configured");
  }

  const stream = await siliconFlow.chat.completions.create({
    model: process.env.SILICONFLOW_MODEL ?? "Qwen/Qwen2.5-7B-Instruct",
    messages: [
      {
        role: "system",
        content: STUDY_ASSISTANT_SYSTEM_PROMPT,
      },
      ...messages,
    ],
    temperature: 0.6,
    stream: true,
  });

  return (async function* () {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;

      if (delta) {
        yield delta;
      }
    }
  })();
}
