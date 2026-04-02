import { prisma } from "@/lib/prisma";
import type {
  ChatMessage,
  ChatRecord,
  ChatRenameResult,
  ChatSummary,
  ConversationMessage,
  CreateMessageInput,
} from "@/server/chat/chat-types";

export async function listChats(): Promise<ChatSummary[]> {
  return prisma.chat.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getChatMessages(chatId: string): Promise<ChatMessage[]> {
  return prisma.message.findMany({
    where: { chatId },
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
): Promise<ConversationMessage[]> {
  return prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      content: true,
    },
  });
}

export async function getChatById(chatId: string): Promise<ChatRecord | null> {
  return prisma.chat.findUnique({
    where: { id: chatId },
    select: {
      id: true,
      title: true,
    },
  });
}

export async function createChat(title: string): Promise<ChatRecord> {
  return prisma.chat.create({
    data: { title },
    select: {
      id: true,
      title: true,
    },
  });
}

export async function renameChatTitle(
  chatId: string,
  title: string,
): Promise<ChatRenameResult> {
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
  return prisma.chat.delete({
    where: { id: chatId },
  });
}

export async function createMessage(data: CreateMessageInput) {
  return prisma.message.create({
    data,
  });
}
