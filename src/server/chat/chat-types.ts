export type ChatRole = "user" | "assistant";

export type ConversationMessage = {
  role: ChatRole;
  content: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
};

export type ChatSummary = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ChatRenameResult = {
  id: string;
  title: string;
  updatedAt: Date;
};

export type ChatRecord = {
  id: string;
  title: string;
};

export type CreateMessageInput = {
  chatId: string;
  role: ChatRole;
  content: string;
};
