import {
  createAssistantReply,
  streamAssistantReply,
} from "@/server/ai/chat-provider";
import { assertChatOwner } from "@/server/chat/chat-auth";
import type { ChatOwner } from "@/server/chat/chat-types";
import {
  createChat,
  createMessage,
  deleteChat,
  getChatById,
  getChatMessages,
  getConversationMessages,
  listChats,
  renameChatTitle,
} from "@/server/chat/chat-repository";
import {
  assertGuestMessageQuotaAvailable,
  consumeGuestMessageQuota,
} from "@/server/guest/guest-service";

type PrepareChatReplyInput = {
  owner: ChatOwner;
  chatId?: string;
  message: string;
};

export async function listChatSummaries(owner: ChatOwner) {
  return listChats(owner);
}

export async function loadChatMessages(owner: ChatOwner, chatId: string) {
  return getChatMessages(chatId, owner);
}

export async function renameChat(owner: ChatOwner, chatId: string, title: string) {
  const chat = await getChatById(chatId, owner);
  assertChatOwner(chat, owner);
  return renameChatTitle(chatId, title);
}

export async function deleteChatById(owner: ChatOwner, chatId: string) {
  const chat = await getChatById(chatId, owner);
  assertChatOwner(chat, owner);
  await deleteChat(chatId);
}

export async function prepareChatReply({
  owner,
  chatId,
  message,
}: PrepareChatReplyInput) {
  const existingChat = chatId ? await getChatById(chatId, owner) : null;
  if (chatId) {
    assertChatOwner(existingChat, owner);
  }

  if (owner.kind === "guest") {
    await assertGuestMessageQuotaAvailable(owner.guestSessionId);
  }

  const activeChat =
    existingChat ??
    (await createChat(createAssistantReply(message, { mode: "title" }), owner));

  await createMessage({
    chatId: activeChat.id,
    role: "user",
    content: message,
  });

  if (owner.kind === "guest") {
    await consumeGuestMessageQuota(owner.guestSessionId);
  }

  const conversationMessages = await getConversationMessages(activeChat.id, owner);
  const replyStream = await streamAssistantReply(conversationMessages);

  return {
    chatId: activeChat.id,
    replyStream,
    isNewChat: !existingChat,
  };
}
