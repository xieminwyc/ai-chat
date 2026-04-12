import { prisma } from "@/lib/prisma";
import {
  buildTimeBasedPaginationParams,
  processPaginationResult,
} from "@/server/shared/pagination/pagination";
import type {
  CursorPaginationParams,
  PaginatedResult,
} from "@/server/shared/pagination/pagination-types";
import type {
  ChatMessage,
  ChatOwner,
  ChatRecord,
  ChatRenameResult,
  ChatSummary,
  ConversationMessage,
  CreateMessageInput,
} from "@/server/chat/chat-types";

function buildOwnerWhere(owner: ChatOwner) {
  return owner.kind === "user"
    ? { userId: owner.userId }
    : { guestSessionId: owner.guestSessionId };
}

export async function listChats(owner: ChatOwner): Promise<ChatSummary[]> {
  return prisma.chat.findMany({
    where: buildOwnerWhere(owner),
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getChatMessages(
  chatId: string,
  owner: ChatOwner,
): Promise<ChatMessage[]> {
  return prisma.message.findMany({
    where: {
      chatId,
      chat: buildOwnerWhere(owner),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    },
  });
}

export async function getConversationMessages(
  chatId: string,
  owner: ChatOwner,
): Promise<ConversationMessage[]> {
  return prisma.message.findMany({
    where: {
      chatId,
      chat: buildOwnerWhere(owner),
    },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      content: true,
    },
  });
}

export async function getChatById(
  chatId: string,
  owner: ChatOwner,
): Promise<ChatRecord | null> {
  return prisma.chat.findFirst({
    where: {
      id: chatId,
      ...buildOwnerWhere(owner),
    },
    select: {
      id: true,
      title: true,
      userId: true,
      guestSessionId: true,
    },
  });
}

export async function createChat(
  title: string,
  owner: ChatOwner,
): Promise<ChatRecord> {
  return prisma.chat.create({
    data: {
      title,
      ...buildOwnerWhere(owner),
    },
    select: {
      id: true,
      title: true,
      userId: true,
      guestSessionId: true,
    },
  });
}

/**
 * 创建 Chat 和第一条 Message（事务版本）
 * 确保 Chat 和 Message 要么同时创建成功，要么同时失败
 */
export async function createChatWithFirstMessage(
  title: string,
  owner: ChatOwner,
  firstMessageContent: string
): Promise<ChatRecord> {
  return prisma.$transaction(async (tx) => {
    const chat = await tx.chat.create({
      data: {
        title,
        ...buildOwnerWhere(owner),
      },
      select: {
        id: true,
        title: true,
        userId: true,
        guestSessionId: true,
      },
    });

    await tx.message.create({
      data: {
        chatId: chat.id,
        role: "user",
        content: firstMessageContent,
      },
    });

    return chat;
  });
}

export async function renameChatTitle(
  chatId: string,
  title: string,
): Promise<ChatRenameResult> {
  // 这里默认上层已经先做过 owner 校验，所以仓储层只负责执行更新。
  return prisma.chat.update({
    where: { id: chatId },
    data: { title },
    select: {
      id: true,
      title: true,
      updatedAt: true,
    },
  });
}

export async function deleteChat(chatId: string) {
  // 同理，删除前的权限判断放在 service / route 层做。
  return prisma.chat.delete({
    where: { id: chatId },
  });
}

export async function createMessage(data: CreateMessageInput) {
  return prisma.message.create({
    data,
  });
}

/**
 * 游标分页获取聊天列表
 *
 * @param owner 所有者
 * @param pagination 分页参数
 * @returns 分页结果
 */
export async function listChatsPaginated(
  owner: ChatOwner,
  pagination: CursorPaginationParams = {}
): Promise<PaginatedResult<ChatSummary>> {
  const where = buildOwnerWhere(owner);

  // 构建分页参数
  const params = buildTimeBasedPaginationParams(
    pagination,
    "updatedAt", // 按更新时间排序
    "desc", // 最新的在前
    20, // 默认 20 条
    100 // 最大 100 条
  );

  // 执行查询
  const items = await prisma.chat.findMany({
    where: params.where ? { ...where, AND: [params.where] } : where,
    take: params.take,
    orderBy: { updatedAt: params.orderBy },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // 处理分页结果
  const limit = Math.min(pagination.limit ?? 20, 100);
  return processPaginationResult(
    items.map((item) => ({
      ...item,
      // 确保返回的是 Date 对象（而不是 string）
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    limit,
    "updatedAt", // 排序字段（游标使用此字段的值）
    "desc"       // 排序方向
  );
}
