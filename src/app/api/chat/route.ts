import { NextResponse } from "next/server";

import { createAssistantReply, streamAssistantReply } from "@/lib/chat";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function logInfo(event: string, details: Record<string, unknown> = {}) {
  console.log(`[chat-api] ${event}`, details);
}

function logError(
  event: string,
  error: unknown,
  details: Record<string, unknown> = {},
) {
  console.error(`[chat-api] ${event}`, {
    ...details,
    error: error instanceof Error ? error.message : String(error),
  });
}

function getDurationMs(startedAt: number) {
  return Date.now() - startedAt;
}

async function getConversationMessages(chatId: string) {
  const messages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      content: true,
    },
  });

  logInfo("conversation.loaded", {
    chatId,
    messageCount: messages.length,
  });

  return messages;
}

function createStreamingChatResponse(
  chatId: string,
  replyStream: AsyncIterable<string>,
  startedAt: number,
) {
  const encoder = new TextEncoder();

  return new Response(
    // new Response(第一个参数, 第二个参数) 里，第一个参数就是响应体 body。
    // 这里传入的是 ReadableStream，所以前端拿到的 response.body 也会是这个流。
    // Response 的 body 这里不是普通字符串，而是一个可持续往外推数据的可读流。
    new ReadableStream({
      async start(controller) {
        // assistantReply 只在服务端内部用来“拼出完整回复”，方便最后一次性落库。
        let assistantReply = "";

        try {
          // replyStream 会持续吐出模型生成的文本片段。
          // 每拿到一段：
          // 1. 先拼到完整回复里
          // 2. 再立刻推给前端
          // 所以前端才能边生成边显示，而不是等全部结束再看到结果。
          for await (const delta of replyStream) {
            assistantReply += delta;
            controller.enqueue(encoder.encode(delta));
          }

          // 模型流结束后，assistantReply 才是一条完整消息。
          // 这时再写入数据库，聊天历史里保存的就是完整 assistant 回复，而不是半截内容。
          if (assistantReply.trim()) {
            await prisma.message.create({
              data: {
                chatId,
                role: "assistant",
                content: assistantReply,
              },
            });
          }

          logInfo("post.success", {
            chatId,
            replyLength: assistantReply.length,
            durationMs: getDurationMs(startedAt),
          });

          // 明确告诉浏览器：这条流已经发完了。
          controller.close();
        } catch (error) {
          // 如果模型请求或数据库写入出错，就让这条流以错误结束。
          // 前端读取 response.body 时就能感知到这次流式请求失败了。
          logError("post.stream_error", error, {
            chatId,
            durationMs: getDurationMs(startedAt),
          });
          controller.error(error);
        }
      },
    }),
    {
      headers: {
        // 告诉前端这是一段普通文本流，不是 JSON。
        "Content-Type": "text/plain; charset=utf-8",
        // 流式结果是实时生成的，不应该被缓存。
        "Cache-Control": "no-store",
        // 把当前 chatId 放在响应头里，前端第一次发消息时就能立即知道新会话 id。
        "X-Chat-Id": chatId,
      },
    },
  );
}

export async function GET(request: Request) {
  const startedAt = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get("chatId");

    if (!chatId) {
      logInfo("get.list.start");

      // 不带 chatId 时返回会话列表，给左侧 chat list 使用。
      const chats = await prisma.chat.findMany({
        // 会话列表按最近活跃时间倒序排，更符合真实聊天产品的直觉。
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      logInfo("get.list.success", {
        chatCount: chats.length,
        durationMs: getDurationMs(startedAt),
      });

      return NextResponse.json({ chats });
    }

    logInfo("get.messages.start", { chatId });

    // 读取某个会话的全部历史消息，并按创建时间排序返回给前端。
    const messages = await prisma.message.findMany({
      where: { chatId },
      // 这里按 createdAt 升序排，前端展示时就是从上到下的时间顺序了。
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    logInfo("get.messages.success", {
      chatId,
      messageCount: messages.length,
      durationMs: getDurationMs(startedAt),
    });

    return NextResponse.json({ chatId, messages });
  } catch (error) {
    logError("get.error", error, {
      durationMs: getDurationMs(startedAt),
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Chat history route failed",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const startedAt = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get("chatId");

    if (!chatId) {
      return NextResponse.json(
        { error: "chatId is required" },
        { status: 400 },
      );
    }

    logInfo("delete.start", { chatId });

    // 删除 Chat 时，数据库会根据 schema 里的 onDelete: Cascade 自动删掉相关 Message。
    await prisma.chat.delete({
      where: { id: chatId },
    });

    logInfo("delete.success", {
      chatId,
      durationMs: getDurationMs(startedAt),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const chatId = new URL(request.url).searchParams.get("chatId");

    logError("delete.error", error, {
      chatId,
      durationMs: getDurationMs(startedAt),
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Delete chat route failed",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const startedAt = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get("chatId");
    const body = (await request.json()) as {
      title?: string;
    };
    const title = body.title?.trim();

    if (!chatId) {
      return NextResponse.json(
        { error: "chatId is required" },
        { status: 400 },
      );
    }

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    logInfo("patch.start", {
      chatId,
      titleLength: title.length,
    });

    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: { title },
      select: {
        id: true,
        title: true,
        updatedAt: true,
      },
    });

    logInfo("patch.success", {
      chatId,
      durationMs: getDurationMs(startedAt),
    });

    return NextResponse.json({ chat });
  } catch (error) {
    const chatId = new URL(request.url).searchParams.get("chatId");

    logError("patch.error", error, {
      chatId,
      durationMs: getDurationMs(startedAt),
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Rename chat route failed",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const body = (await request.json()) as {
      chatId?: string;
      message?: string;
    };
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 },
      );
    }

    logInfo("post.start", {
      chatId: body.chatId ?? null,
      messageLength: message.length,
    });

    // 如果前端已经带了 chatId，就继续写进现有会话；否则后面新建一条会话。
    const chat = body.chatId
      ? await prisma.chat.findUnique({
          where: { id: body.chatId },
        })
      : null;

    // 第一次发消息时还没有 chat，所以这里按“有则复用、没有就创建”的方式拿到当前会话。
    const activeChat =
      chat ??
      (await prisma.chat.create({
        data: {
          // 新会话标题和正文回复分开生成：标题用于左侧会话列表，要求更短、更概括。
          title: createAssistantReply(message, { mode: "title" }),
        },
      }));

    logInfo("post.chat_ready", {
      chatId: activeChat.id,
      isNewChat: !chat,
    });

    // 先保存用户消息，再保存助手回复。这样数据库里的聊天记录顺序就和真实对话一致。
    await prisma.message.create({
      data: {
        chatId: activeChat.id,
        role: "user",
        content: message,
      },
    });

    // 取出当前会话的完整上下文，按时间顺序喂给模型，模型才能知道前面对话说了什么。
    const conversationMessages = await getConversationMessages(activeChat.id);
    const replyStream = await streamAssistantReply(conversationMessages);

    // 这里直接返回文本流给浏览器，前端会边收边显示，不用等整段回复生成完。
    return createStreamingChatResponse(activeChat.id, replyStream, startedAt);
  } catch (error) {
    logError("post.error", error, {
      durationMs: getDurationMs(startedAt),
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Chat route failed",
      },
      { status: 500 },
    );
  }
}
