import { ForbiddenError, UnauthorizedError } from "@/server/chat/chat-errors";

type MinimalUser = {
  id: string;
  email: string;
};

type MinimalChat = {
  id: string;
  title: string;
  userId: string;
};

export { ForbiddenError, UnauthorizedError };

export function requireAuthenticatedUser(user: MinimalUser | null) {
  if (!user) {
    throw new UnauthorizedError();
  }

  return user;
}

export function assertChatOwner(chat: MinimalChat | null, userId: string) {
  if (!chat || chat.userId !== userId) {
    throw new ForbiddenError();
  }

  return chat;
}
