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

export type ChatOwner =
  | {
      kind: "user";
      userId: string;
    }
  | {
      kind: "guest";
      guestSessionId: string;
    };

export type ChatRecord = {
  id: string;
  title: string;
  userId: string | null;
  guestSessionId: string | null;
};

export type CreateMessageInput = {
  chatId: string;
  role: ChatRole;
  content: string;
};
