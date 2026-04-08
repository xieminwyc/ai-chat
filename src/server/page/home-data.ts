import { cookies } from "next/headers";

import { getCurrentSession } from "@/server/auth/auth-service";
import { getSessionCookieName } from "@/server/auth/session";
import { chatQuerySchema } from "@/server/chat/chat-schemas";
import { listChatSummaries, loadChatMessages } from "@/server/chat/chat-service";

export type HomePageUser = {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type HomePageChatSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type HomePageChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type HomePageData = {
  isAuthenticated: boolean;
  currentUser: HomePageUser | null;
  initialChats: HomePageChatSummary[];
  initialMessages: HomePageChatMessage[];
  initialChatId: string | null;
};

type GetHomePageDataInput = {
  selectedChatId?: string;
};

function serializeUser(user: {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}): HomePageUser {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function serializeChat(chat: {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}): HomePageChatSummary {
  return {
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  };
}

function serializeMessage(message: {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}): HomePageChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

function createSignedOutHomePageData(): HomePageData {
  return {
    isAuthenticated: false,
    currentUser: null,
    initialChats: [],
    initialMessages: [],
    initialChatId: null,
  };
}

export async function getHomePageData({
  selectedChatId,
}: GetHomePageDataInput): Promise<HomePageData> {
  const cookieStore = await cookies();
  const sessionToken =
    cookieStore.get(getSessionCookieName())?.value ?? null;
  const session = await getCurrentSession(sessionToken);

  if (!session) {
    return createSignedOutHomePageData();
  }

  const initialChats = (await listChatSummaries(session.user.id)).map(
    serializeChat,
  );

  const selectedChatResult = chatQuerySchema.safeParse({
    chatId: selectedChatId,
  });
  const nextChatId =
    selectedChatResult.success &&
    selectedChatResult.data.chatId &&
    initialChats.some((chat) => chat.id === selectedChatResult.data.chatId)
      ? selectedChatResult.data.chatId
      : null;

  // 这里先用“chatId 是否出现在当前用户的聊天列表里”做一道服务端兜底，
  // 避免把别人的 chatId 直接拿去加载消息。
  const initialMessages = nextChatId
    ? (await loadChatMessages(session.user.id, nextChatId)).map(serializeMessage)
    : [];

  return {
    isAuthenticated: true,
    currentUser: serializeUser(session.user),
    initialChats,
    initialMessages,
    initialChatId: nextChatId,
  };
}
