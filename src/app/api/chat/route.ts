import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentSession } from "@/server/auth/auth-service";
import { readSessionTokenFromCookieHeader } from "@/server/auth/session";
import { requireAuthenticatedUser } from "@/server/chat/chat-auth";
import { ForbiddenError, UnauthorizedError } from "@/server/chat/chat-errors";
import { createStreamingChatResponse } from "@/server/chat/chat-stream";
import { getDurationMs, logError, logInfo } from "@/server/chat/chat-logger";
import { chatQuerySchema, postChatSchema, renameChatSchema } from "@/server/chat/chat-schemas";
import {
  deleteChatById,
  listChatSummaries,
  loadChatMessages,
  prepareChatReply,
  renameChat,
} from "@/server/chat/chat-service";

export const runtime = "nodejs";

async function getAuthenticatedUserFromRequest(request: Request) {
  const sessionToken = readSessionTokenFromCookieHeader(
    request.headers.get("cookie"),
  );
  const session = await getCurrentSession(sessionToken);
  return requireAuthenticatedUser(session?.user ?? null);
}

function toRouteErrorResponse(
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : fallbackMessage,
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const startedAt = Date.now();

  try {
    const currentUser = await getAuthenticatedUserFromRequest(request);
    const { searchParams } = new URL(request.url);
    const { chatId } = chatQuerySchema.parse({
      chatId: searchParams.get("chatId") ?? undefined,
    });

    if (!chatId) {
      logInfo("get.list.start");

      const chats = await listChatSummaries(currentUser.id);

      logInfo("get.list.success", {
        chatCount: chats.length,
        durationMs: getDurationMs(startedAt),
      });

      return NextResponse.json({ chats });
    }

    logInfo("get.messages.start", { chatId });

    const messages = await loadChatMessages(currentUser.id, chatId);

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

    return toRouteErrorResponse(error, "Chat history route failed");
  }
}

export async function DELETE(request: Request) {
  const startedAt = Date.now();

  try {
    const currentUser = await getAuthenticatedUserFromRequest(request);
    const { searchParams } = new URL(request.url);
    const { chatId } = chatQuerySchema.parse({
      chatId: searchParams.get("chatId") ?? undefined,
    });

    if (!chatId) {
      return NextResponse.json(
        { error: "chatId is required" },
        { status: 400 },
      );
    }

    logInfo("delete.start", { chatId });

    await deleteChatById(currentUser.id, chatId);

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

    return toRouteErrorResponse(error, "Delete chat route failed");
  }
}

export async function PATCH(request: Request) {
  const startedAt = Date.now();

  try {
    const currentUser = await getAuthenticatedUserFromRequest(request);
    const { searchParams } = new URL(request.url);
    const { chatId } = chatQuerySchema.parse({
      chatId: searchParams.get("chatId") ?? undefined,
    });
    const { title } = renameChatSchema.parse(await request.json());

    if (!chatId) {
      return NextResponse.json(
        { error: "chatId is required" },
        { status: 400 },
      );
    }

    logInfo("patch.start", {
      chatId,
      titleLength: title.length,
    });

    const chat = await renameChat(currentUser.id, chatId, title);

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

    return toRouteErrorResponse(error, "Rename chat route failed");
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const currentUser = await getAuthenticatedUserFromRequest(request);
    const { chatId: requestedChatId, message } = postChatSchema.parse(
      await request.json(),
    );

    logInfo("post.start", {
      chatId: requestedChatId ?? null,
      messageLength: message.length,
    });

    const { chatId, isNewChat, replyStream } = await prepareChatReply({
      userId: currentUser.id,
      chatId: requestedChatId,
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

    return toRouteErrorResponse(error, "Chat route failed");
  }
}
