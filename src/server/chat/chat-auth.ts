import { ForbiddenError, UnauthorizedError } from "@/server/chat/chat-errors";
import type { ChatOwner } from "@/server/chat/chat-types";

type MinimalUser = {
  id: string;
  email: string;
  emailVerifiedAt?: Date | null;
};

type MinimalChat = {
  id: string;
  title: string;
  userId: string | null;
  guestSessionId: string | null;
};

export { ForbiddenError, UnauthorizedError };

const emailVerificationRequiredMessage = "请先验证邮箱后再继续聊天。";

export function requireAuthenticatedUser(user: MinimalUser | null) {
  if (!user) {
    throw new UnauthorizedError();
  }

  return user;
}

export function requireVerifiedUser(user: MinimalUser | null) {
  const authenticatedUser = requireAuthenticatedUser(user);

  if (authenticatedUser.emailVerifiedAt == null) {
    throw new ForbiddenError(emailVerificationRequiredMessage);
  }

  return authenticatedUser;
}

export function assertChatOwner(chat: MinimalChat | null, owner: ChatOwner) {
  if (!chat) {
    throw new ForbiddenError();
  }

  if (owner.kind === "user" && chat.userId !== owner.userId) {
    throw new ForbiddenError();
  }

  if (
    owner.kind === "guest" &&
    chat.guestSessionId !== owner.guestSessionId
  ) {
    throw new ForbiddenError();
  }

  return chat;
}
