import { NextResponse } from "next/server";

import { createStreamingChatResponse } from "@/server/chat/chat-stream";
import { getDurationMs, logError, logInfo } from "@/server/chat/chat-logger";
import {
  deleteChatById,
  listChatSummaries,
  loadChatMessages,
  prepareChatReply,
  renameChat,
} from "@/server/chat/chat-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const startedAt = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get("chatId");

    if (!chatId) {
      logInfo("get.list.start");

      const chats = await listChatSummaries();

      logInfo("get.list.success", {
        chatCount: chats.length,
        durationMs: getDurationMs(startedAt),
      });

      return NextResponse.json({ chats });
    }

    logInfo("get.messages.start", { chatId });

    const messages = await loadChatMessages(chatId);

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

    await deleteChatById(chatId);

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

    const chat = await renameChat(chatId, title);

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

    const { chatId, isNewChat, replyStream } = await prepareChatReply({
      chatId: body.chatId,
      message,
    });

    logInfo("post.chat_ready", {
      chatId,
      isNewChat,
    });

    return createStreamingChatResponse({
      chatId,
      replyStream,
      startedAt,
    });
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
