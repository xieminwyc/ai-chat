import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentSession } from "@/server/auth/auth-service";
import { readSessionTokenFromCookieHeader } from "@/server/auth/session";
import { requireVerifiedUser } from "@/server/chat/chat-auth";
import { ForbiddenError, UnauthorizedError } from "@/server/chat/chat-errors";
import { createStreamingChatResponse } from "@/server/chat/chat-stream";
import { getDurationMs, logError, logInfo } from "@/server/chat/chat-logger";
import { chatQuerySchema, postChatSchema, renameChatSchema } from "@/server/chat/chat-schemas";
import type { ChatOwner } from "@/server/chat/chat-types";
import {
  deleteChatById,
  listChatSummaries,
  loadChatMessages,
  prepareChatReply,
  renameChat,
} from "@/server/chat/chat-service";
import { listChatsPaginated } from "@/server/chat/chat-repository";
import type { CursorPaginationParams } from "@/server/shared/pagination/pagination-types";
import { getCurrentGuestSession, getOrCreateGuestSession } from "@/server/guest/guest-service";
import {
  getGuestCookieName,
  getGuestCookieOptions,
  readGuestTokenFromCookieHeader,
} from "@/server/guest/guest-session";
import { isAppErrorLike } from "@/server/shared/errors/app-error";
import { enforceChatMessageRateLimit } from "@/server/rate-limit/rate-limit-policies";

export const runtime = "nodejs";

type ResolvedChatActor = {
  owner: ChatOwner;
  guestSession:
    | {
        guestToken: string;
        expiresAt?: Date;
      }
    | null;
  shouldSetGuestCookie: boolean;
};

type ResolveChatActorOptions = {
  allowGuestCreate: boolean;
  requireVerifiedUser: boolean;
};

function hasGuestSessionErrorMessage(error: unknown): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  return [
    "Guest session not found.",
    "Guest session expired. Please refresh to continue.",
    "Guest session has already been merged.",
  ].includes(error.message);
}

function hasGuestTrialLimitReachedMessage(error: unknown): error is Error {
  return (
    error instanceof Error &&
    error.message === "Guest trial limit reached. Please register to continue."
  );
}

async function resolveChatActorFromRequest(
  request: Request,
  options: ResolveChatActorOptions,
): Promise<ResolvedChatActor> {
  const cookieHeader = request.headers.get("cookie");
  const sessionToken = readSessionTokenFromCookieHeader(cookieHeader);
  const session = await getCurrentSession(sessionToken);

  if (session) {
    if (options.requireVerifiedUser) {
      requireVerifiedUser(session.user);
    }

    return {
      owner: { kind: "user", userId: session.user.id },
      guestSession: null,
      shouldSetGuestCookie: false,
    };
  }

  const guestToken = readGuestTokenFromCookieHeader(cookieHeader);

  if (options.allowGuestCreate) {
    const { guestSession, created } = await getOrCreateGuestSession(guestToken);

    return {
      owner: { kind: "guest", guestSessionId: guestSession.id },
      guestSession,
      shouldSetGuestCookie: created || !guestToken,
    };
  }

  const guestSession = await getCurrentGuestSession(guestToken);

  if (guestSession) {
    return {
      owner: { kind: "guest", guestSessionId: guestSession.id },
      guestSession,
      shouldSetGuestCookie: false,
    };
  }

  throw new UnauthorizedError();
}

function applyGuestCookie(response: NextResponse, actor: ResolvedChatActor) {
  if (!actor.shouldSetGuestCookie || !actor.guestSession) {
    return response;
  }

  response.cookies.set(getGuestCookieName(), actor.guestSession.guestToken, {
    ...getGuestCookieOptions(),
    ...(actor.guestSession.expiresAt
      ? { expires: actor.guestSession.expiresAt }
      : {}),
  });

  return response;
}

function applyGuestCookieToStreamingResponse(
  response: Response,
  actor: ResolvedChatActor,
) {
  if (!actor.shouldSetGuestCookie || !actor.guestSession) {
    return response;
  }

  const nextResponse = new NextResponse(response.body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });

  nextResponse.cookies.set(getGuestCookieName(), actor.guestSession.guestToken, {
    ...getGuestCookieOptions(),
    ...(actor.guestSession.expiresAt
      ? { expires: actor.guestSession.expiresAt }
      : {}),
  });

  return nextResponse;
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

  if (hasGuestSessionErrorMessage(error)) {
    return NextResponse.json(
      { error: error.message },
      { status: 401 },
    );
  }

  if (hasGuestTrialLimitReachedMessage(error)) {
    return NextResponse.json(
      { error: error.message },
      { status: 403 },
    );
  }

  if (isAppErrorLike(error)) {
    return NextResponse.json(
      { error: error.message },
      { status: error.httpStatus },
    );
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
    const { searchParams } = new URL(request.url);
    const { chatId } = chatQuerySchema.parse({
      chatId: searchParams.get("chatId") ?? undefined,
    });

    // 游标分页参数
    const cursor = searchParams.get("cursor");
    const limit = searchParams.get("limit");
    const usePagination = cursor !== null || limit !== null;

    const actor = await resolveChatActorFromRequest(request, {
      allowGuestCreate: !chatId,
      requireVerifiedUser: false,
    });

    if (!chatId) {
      logInfo("get.list.start", { usePagination });

      if (usePagination) {
        // 使用游标分页
        const paginationParams: CursorPaginationParams = {
          cursor: cursor || undefined,
          limit: limit ? parseInt(limit, 10) : undefined,
        };

        const result = await listChatsPaginated(actor.owner, paginationParams);

        logInfo("get.list.success", {
          chatCount: result.items.length,
          hasMore: result.hasMore,
          durationMs: getDurationMs(startedAt),
        });

        return applyGuestCookie(
          NextResponse.json({
            chats: result.items,
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
          }),
          actor
        );
      }

      // 使用原有逻辑（返回全部）
      const chats = await listChatSummaries(actor.owner);

      logInfo("get.list.success", {
        chatCount: chats.length,
        durationMs: getDurationMs(startedAt),
      });

      return applyGuestCookie(NextResponse.json({ chats }), actor);
    }

    logInfo("get.messages.start", { chatId });

    const messages = await loadChatMessages(actor.owner, chatId);

    logInfo("get.messages.success", {
      chatId,
      messageCount: messages.length,
      durationMs: getDurationMs(startedAt),
    });

    return applyGuestCookie(NextResponse.json({ chatId, messages }), actor);
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
    const actor = await resolveChatActorFromRequest(request, {
      allowGuestCreate: false,
      requireVerifiedUser: false,
    });
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

    await deleteChatById(actor.owner, chatId);

    logInfo("delete.success", {
      chatId,
      durationMs: getDurationMs(startedAt),
    });

    return applyGuestCookie(NextResponse.json({ success: true }), actor);
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
    const actor = await resolveChatActorFromRequest(request, {
      allowGuestCreate: false,
      requireVerifiedUser: false,
    });
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

    const chat = await renameChat(actor.owner, chatId, title);

    logInfo("patch.success", {
      chatId,
      durationMs: getDurationMs(startedAt),
    });

    return applyGuestCookie(NextResponse.json({ chat }), actor);
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
    const actor = await resolveChatActorFromRequest(request, {
      allowGuestCreate: true,
      requireVerifiedUser: true,
    });
    const { chatId: requestedChatId, message } = postChatSchema.parse(
      await request.json(),
    );

    logInfo("post.start", {
      chatId: requestedChatId ?? null,
      messageLength: message.length,
    });

    // 聊天频率保护放在真正生成回复前，避免模型和数据库资源先被打满。
    await enforceChatMessageRateLimit({
      actor: actor.owner,
    });

    const { chatId, isNewChat, replyStream } = await prepareChatReply({
      owner: actor.owner,
      chatId: requestedChatId,
      message,
    });

    logInfo("post.chat_ready", {
      chatId,
      isNewChat,
    });

    const response = createStreamingChatResponse({
      chatId,
      replyStream,
      startedAt,
    });

    // home-data.ts 无法写 cookie，所以第一次游客访问要在可写的 route response 里补上。
    return applyGuestCookieToStreamingResponse(response, actor);
  } catch (error) {
    logError("post.error", error, {
      durationMs: getDurationMs(startedAt),
    });

    return toRouteErrorResponse(error, "Chat route failed");
  }
}
