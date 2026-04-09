import { prisma } from "@/lib/prisma";
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
