import {
  createAssistantReply,
  streamAssistantReply,
} from "@/server/ai/chat-provider";
import { assertChatOwner } from "@/server/chat/chat-auth";
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

type PrepareChatReplyInput = {
  userId: string;
  chatId?: string;
  message: string;
};

export async function listChatSummaries(userId: string) {
  return listChats(userId);
}

export async function loadChatMessages(userId: string, chatId: string) {
  return getChatMessages(chatId, userId);
}

export async function renameChat(userId: string, chatId: string, title: string) {
  const chat = await getChatById(chatId, userId);
  assertChatOwner(chat, userId);
  return renameChatTitle(chatId, title);
}

export async function deleteChatById(userId: string, chatId: string) {
  const chat = await getChatById(chatId, userId);
  assertChatOwner(chat, userId);
  await deleteChat(chatId);
}

export async function prepareChatReply({
  userId,
  chatId,
  message,
}: PrepareChatReplyInput) {
  const existingChat = chatId ? await getChatById(chatId, userId) : null;
  if (existingChat) {
    assertChatOwner(existingChat, userId);
  }
  const activeChat =
    existingChat ??
    (await createChat(createAssistantReply(message, { mode: "title" }), userId));

  await createMessage({
    chatId: activeChat.id,
    role: "user",
    content: message,
  });

  const conversationMessages = await getConversationMessages(activeChat.id, userId);
  const replyStream = await streamAssistantReply(conversationMessages);

  return {
    chatId: activeChat.id,
    replyStream,
    isNewChat: !existingChat,
  };
}
