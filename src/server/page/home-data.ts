import { cookies } from "next/headers";

import { getCurrentSession } from "@/server/auth/auth-service";
import { getSessionCookieName } from "@/server/auth/session";
import { chatQuerySchema } from "@/server/chat/chat-schemas";
import type { ChatOwner } from "@/server/chat/chat-types";
import { listChatSummaries, loadChatMessages } from "@/server/chat/chat-service";
import {
  getCurrentGuestSession,
  GUEST_MESSAGE_LIMIT,
} from "@/server/guest/guest-service";
import { getGuestCookieName } from "@/server/guest/guest-session";

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

export type ViewerKind = "user" | "guest";

export type HomePageData = {
  viewerKind: ViewerKind;
  isAuthenticated: boolean;
  currentUser: HomePageUser | null;
  guestSession: {
    id: string;
    trialMessageCount: number;
    messageLimit: number;
  } | null;
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

function createGuestHomePageData(
  guestSession:
    | {
        id: string;
        trialMessageCount: number;
      }
    | null,
  initialChats: HomePageChatSummary[] = [],
  initialMessages: HomePageChatMessage[] = [],
  initialChatId: string | null = null,
): HomePageData {
  return {
    viewerKind: "guest",
    isAuthenticated: false,
    currentUser: null,
    guestSession: guestSession
      ? {
          id: guestSession.id,
          trialMessageCount: guestSession.trialMessageCount,
          messageLimit: GUEST_MESSAGE_LIMIT,
        }
      : null,
    initialChats,
    initialMessages,
    initialChatId,
  };
}

function getSelectedChatId(
  selectedChatId: string | undefined,
  initialChats: HomePageChatSummary[],
) {
  const selectedChatResult = chatQuerySchema.safeParse({
    chatId: selectedChatId,
  });

  return selectedChatResult.success &&
    selectedChatResult.data.chatId &&
    initialChats.some((chat) => chat.id === selectedChatResult.data.chatId)
    ? selectedChatResult.data.chatId
    : null;
}

async function loadInitialChatState(
  owner: ChatOwner,
  selectedChatId: string | undefined,
) {
  const initialChats = (await listChatSummaries(owner)).map(serializeChat);
  const nextChatId = getSelectedChatId(selectedChatId, initialChats);
  const initialMessages = nextChatId
    ? (await loadChatMessages(owner, nextChatId)).map(serializeMessage)
    : [];

  return {
    initialChats,
    initialMessages,
    initialChatId: nextChatId,
  };
}

export async function getHomePageData({
  selectedChatId,
}: GetHomePageDataInput): Promise<HomePageData> {
  const cookieStore = await cookies();
  const sessionToken =
    cookieStore.get(getSessionCookieName())?.value ?? null;
  const session = await getCurrentSession(sessionToken);

  if (session) {
    const owner: ChatOwner = { kind: "user", userId: session.user.id };
    const initialState = await loadInitialChatState(owner, selectedChatId);

    return {
      viewerKind: "user",
      isAuthenticated: true,
      currentUser: serializeUser(session.user),
      guestSession: null,
      ...initialState,
    };
  }

  const guestToken = cookieStore.get(getGuestCookieName())?.value ?? null;
  if (!guestToken) {
    return createGuestHomePageData(null);
  }

  const guestSession = await getCurrentGuestSession(guestToken);

  if (!guestSession) {
    return createGuestHomePageData(null);
  }

  const owner: ChatOwner = {
    kind: "guest",
    guestSessionId: guestSession.id,
  };
  const initialState = await loadInitialChatState(owner, selectedChatId);

  return createGuestHomePageData(
    guestSession,
    initialState.initialChats,
    initialState.initialMessages,
    initialState.initialChatId,
  );
}
