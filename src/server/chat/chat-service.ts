import {
  createAssistantReply,
  streamAssistantReply,
} from "@/server/ai/chat-provider";
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
  chatId?: string;
  message: string;
};

export async function listChatSummaries() {
  return listChats();
}

export async function loadChatMessages(chatId: string) {
  return getChatMessages(chatId);
}

export async function renameChat(chatId: string, title: string) {
  return renameChatTitle(chatId, title);
}

export async function deleteChatById(chatId: string) {
  await deleteChat(chatId);
}

export async function prepareChatReply({
  chatId,
  message,
}: PrepareChatReplyInput) {
  const existingChat = chatId ? await getChatById(chatId) : null;
  const activeChat =
    existingChat ??
    (await createChat(createAssistantReply(message, { mode: "title" })));

  await createMessage({
    chatId: activeChat.id,
    role: "user",
    content: message,
  });

  const conversationMessages = await getConversationMessages(activeChat.id);
  const replyStream = await streamAssistantReply(conversationMessages);

  return {
    chatId: activeChat.id,
    replyStream,
    isNewChat: !existingChat,
  };
}
