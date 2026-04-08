"use client";

import dayjs from "dayjs";
import { FormEvent, useEffect, useRef, useState } from "react";

import { createBrowserId } from "@/lib/browser-id";
import type { HomePageData } from "@/server/page/home-data";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatSummary = {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
};

type AuthMode = "login" | "register";
type AuthFeedbackTone = "error" | "success";

const quickStartIdeas = [
  "帮我把今天脑子里的想法先整理成 3 个主题",
  "把这段技术方案改写成更清楚的人话版本",
  "陪我一步步拆解一个现在有点卡住的问题",
];

function formatChatUpdatedAt(updatedAt?: string) {
  if (!updatedAt) {
    return null;
  }

  return dayjs(updatedAt).format("YYYY-MM-DD HH:mm");
}

function getAuthFeedbackMessage(mode: AuthMode, backendError?: string) {
  if (!backendError) {
    return mode === "login"
      ? "登录失败，请稍后再试。"
      : "注册失败，请稍后再试。";
  }

  if (backendError === "Invalid email or password") {
    return "邮箱或密码不正确。如果你还没注册，可以先切到“注册”创建账号。";
  }

  if (backendError === "Invalid login payload") {
    return "请输入有效的邮箱和密码后再试。";
  }

  if (backendError === "A user with this email already exists") {
    return "这个邮箱已经注册过了，可以直接切到“登录”。";
  }

  if (backendError === "Invalid registration payload") {
    return "注册信息格式不对，请检查邮箱和密码长度。";
  }

  return backendError;
}

export function ChatApp({ initialData }: { initialData: HomePageData }) {
  // 这些 state 不再靠首屏 useEffect 去拉接口初始化，而是直接吃服务端传下来的 bootstrap 数据。
  const [input, setInput] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(
    initialData.isAuthenticated,
  );
  const [currentUser, setCurrentUser] = useState(initialData.currentUser);
  const [chats, setChats] = useState<ChatSummary[]>(initialData.initialChats);
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialData.initialMessages,
  );
  const [chatId, setChatId] = useState<string | null>(
    initialData.initialChatId,
  );
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authFeedback, setAuthFeedback] = useState<string | null>(null);
  const [authFeedbackTone, setAuthFeedbackTone] =
    useState<AuthFeedbackTone | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const activeChat = chats.find((chat) => chat.id === chatId);
  const activeChatTitle = activeChat?.title ?? "新的对话";
  const activeChatUpdatedAt = formatChatUpdatedAt(activeChat?.updatedAt);
  const hasMessages = messages.length > 0;
  const hasAuthError = authFeedbackTone === "error";

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    messagesViewportRef.current?.scrollTo({
      top: messagesViewportRef.current.scrollHeight,
      behavior: "auto",
    });
  }, [messages]);

  useEffect(() => {
    if (!isAuthenticated || !chatId) {
      return;
    }

    // 首屏如果已经由服务端选中了某个 chat，需要立刻把它同步到浏览器本地，
    // 这样 localStorage 里不会继续残留上一次旧会话的 id。
    window.localStorage.setItem("activeChatId", chatId);
  }, [chatId, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || chatId) {
      return;
    }

    const savedChatId = window.localStorage.getItem("activeChatId");

    if (!savedChatId) {
      return;
    }

    if (!chats.some((chat) => chat.id === savedChatId)) {
      window.localStorage.removeItem("activeChatId");
      return;
    }

    // 服务端首屏只知道 URL 里的 chatId，不知道浏览器 localStorage。
    // 所以这里补一层“已登录用户回到老会话”的客户端恢复逻辑。
    void (async () => {
      try {
        const response = await fetch(`/api/chat?chatId=${savedChatId}`);
        const data = (await response.json()) as {
          error?: string;
          messages?: ChatMessage[];
        };

        if (!response.ok) {
          throw new Error(data.error || "读取历史消息失败");
        }

        setMessages(data.messages ?? []);
        setChatId(savedChatId);
        window.localStorage.setItem("activeChatId", savedChatId);
        syncChatIdToUrl(savedChatId);
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "初始化聊天页面时出错了",
        );
      }
    })();
  }, [chatId, chats, isAuthenticated]);

  function syncChatIdToUrl(nextChatId: string | null) {
    const nextUrl = new URL(window.location.href);

    if (nextChatId) {
      nextUrl.searchParams.set("chatId", nextChatId);
    } else {
      nextUrl.searchParams.delete("chatId");
    }

    window.history.replaceState(null, "", nextUrl.toString());
  }

  async function loadChatHistory(activeChatId: string) {
    try {
      const response = await fetch(`/api/chat?chatId=${activeChatId}`);
      const data = (await response.json()) as {
        chatId?: string;
        error?: string;
        messages?: ChatMessage[];
      };

      if (!response.ok) {
        throw new Error(data.error || "读取历史消息失败");
      }

      setMessages(data.messages ?? []);
      setChatId(activeChatId);
      setIsRenaming(false);
      setTitleDraft("");
      setError(null);
      window.localStorage.setItem("activeChatId", activeChatId);
      syncChatIdToUrl(activeChatId);
    } catch (error) {
      setError(error instanceof Error ? error.message : "读取历史消息失败");
    }
  }

  async function loadChatList() {
    if (!isAuthenticated) {
      setChats([]);
      return;
    }

    try {
      const response = await fetch("/api/chat");
      const data = (await response.json()) as {
        chats?: ChatSummary[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "读取会话列表失败");
      }

      setChats(data.chats ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : "读取会话列表失败");
    }
  }

  async function handleRenameChat() {
    if (!chatId) {
      return;
    }

    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setError("会话标题不能为空");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/chat?chatId=${chatId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: nextTitle }),
      });
      const data = (await response.json()) as {
        chat?: ChatSummary;
        error?: string;
      };

      if (!response.ok || !data.chat) {
        throw new Error(data.error || "更新标题失败");
      }

      await loadChatList();
      setIsRenaming(false);
      setTitleDraft("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "更新标题失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeleteChat() {
    if (!chatId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/chat?chatId=${chatId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as {
        error?: string;
        success?: boolean;
      };

      if (!response.ok) {
        throw new Error(data.error || "删除会话失败");
      }

      // 删掉当前会话后，右侧消息区和本地保存的 activeChatId 都要一起清空。
      setChatId(null);
      setIsRenaming(false);
      setTitleDraft("");
      setChats((current) => current.filter((chat) => chat.id !== chatId));
      setMessages([]);
      window.localStorage.removeItem("activeChatId");
      syncChatIdToUrl(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "删除会话失败");
    } finally {
      setIsLoading(false);
    }
  }

  function handleStartNewChat() {
    // 新建聊天时先清空当前会话状态，下一次发送消息时后端会自动创建新的 Chat。
    setChatId(null);
    setMessages([]);
    setIsRenaming(false);
    setTitleDraft("");
    setError(null);
    window.localStorage.removeItem("activeChatId");
    syncChatIdToUrl(null);
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const email = authEmail.trim();
    const password = authPassword.trim();

    if (!email || !password) {
      setAuthFeedback("邮箱和密码都要填写");
      setAuthFeedbackTone("error");
      return;
    }

    setIsAuthSubmitting(true);
    setAuthFeedback(null);
    setAuthFeedbackTone(null);

    try {
      const response = await fetch(
        authMode === "login" ? "/api/auth/login" : "/api/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        },
      );
      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(getAuthFeedbackMessage(authMode, data.error));
      }

      if (authMode === "register") {
        setAuthMode("login");
        setAuthPassword("");
        setAuthFeedback("注册成功，现在可以直接登录了。");
        setAuthFeedbackTone("success");
        return;
      }

      // 登录成功后直接刷新页面，让 page.tsx 重新以服务端身份读取首页初始数据。
      window.location.reload();
    } catch (error) {
      setAuthFeedback(error instanceof Error ? error.message : "认证请求失败");
      setAuthFeedbackTone("error");
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    setIsAuthSubmitting(true);
    setAuthFeedback(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "退出登录失败");
      }

      // 这里先把客户端状态清空，再刷新页面，让服务端重新输出 signed-out 首屏。
      setIsAuthenticated(false);
      setCurrentUser(null);
      setChats([]);
      setMessages([]);
      setChatId(null);
      window.localStorage.removeItem("activeChatId");
      syncChatIdToUrl(null);
      window.location.reload();
    } catch (error) {
      setAuthFeedback(error instanceof Error ? error.message : "退出登录失败");
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAuthenticated) {
      setError("请先登录后再开始聊天");
      return;
    }

    const message = input.trim();
    if (!message) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createBrowserId(),
      role: "user",
      content: message,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const assistantMessageId = createBrowserId();
      const requestBody = chatId ? { chatId, message } : { message };
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // 新会话时不要传 chatId: null。
        // 这里让“没 chatId”真的表现成“字段不存在”，才能匹配后端 optional schema。
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const data = (await response.json()) as {
          error?: string;
        };

        throw new Error(data.error || "请求失败");
      }

      const nextChatId = response.headers.get("x-chat-id");

      if (nextChatId) {
        setChatId(nextChatId);
        // 记住当前会话 id，页面刷新后才能把同一个会话的历史记录读回来。
        window.localStorage.setItem("activeChatId", nextChatId);
        syncChatIdToUrl(nextChatId);
      }

      if (!response.body) {
        throw new Error("后端没有返回流式内容");
      }

      setMessages((current) => [
        ...current,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
        },
      ]);

      // 后端返回的是文本流，所以这里从 response.body 里拿到可读流读取器。
      // 服务端每次 controller.enqueue(...) 推过来一小段，reader.read() 就能读到一小段。
      const reader = response.body.getReader();
      // 后端发来的是 Uint8Array（二进制片段），要先解码成字符串才能显示到页面上。
      const decoder = new TextDecoder();

      while (true) {
        // 每次 read() 都是在等下一段流式内容。
        const { done, value } = await reader.read();

        // done 为 true，说明后端已经 controller.close()，整条回复结束了。
        if (done) {
          break;
        }

        // 把当前这段二进制内容解码成字符串。
        const chunk = decoder.decode(value, { stream: true });

        // 偶尔可能拿到空片段，这种情况直接跳过。
        if (!chunk) {
          continue;
        }

        // 把新片段拼到当前 assistant 消息后面，所以页面上看起来就是“一个字一个字冒出来”。
        setMessages((current) =>
          current.map((currentMessage) =>
            currentMessage.id === assistantMessageId
              ? {
                  ...currentMessage,
                  content: currentMessage.content + chunk,
                }
              : currentMessage,
          ),
        );
      }

      await loadChatList();
    } catch (error) {
      setError(error instanceof Error ? error.message : "发送消息时出错了");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="relative h-[100svh] overflow-hidden px-4 py-4 text-slate-900 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute left-[-8rem] top-[-5rem] h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.82),rgba(255,255,255,0))]" />
        <div className="absolute right-[-4rem] top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(244,199,141,0.34),rgba(244,199,141,0))]" />
        <div className="absolute bottom-[-5rem] left-1/3 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(158,194,214,0.28),rgba(158,194,214,0))]" />
      </div>

      <div className="relative mx-auto h-full w-full max-w-7xl">
        <section className="grid h-full min-h-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 flex-col rounded-[2rem] border border-[rgba(24,48,59,0.1)] bg-white/55 p-4 shadow-[0_18px_45px_rgba(24,48,59,0.08)] backdrop-blur-xl lg:flex">
            <div className="shrink-0 rounded-[1.5rem] border border-white/70 bg-white/68 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-500">
                Thoughtful AI
              </p>
              <h1 className="mt-3 text-lg font-semibold tracking-[-0.02em] text-slate-900">
                AI Chat Studio
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {isAuthenticated
                  ? `当前账号：${currentUser?.email ?? "已登录用户"}`
                  : "先登录，再开始真正按账号隔离的聊天记录与权限控制"}
              </p>
              <button
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[linear-gradient(135deg,#18303b,#355b6d)] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(24,48,59,0.24)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_32px_rgba(24,48,59,0.26)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!isAuthenticated}
                onClick={handleStartNewChat}
                type="button"
              >
                新建聊天
              </button>
            </div>

            {isRenaming ? (
              <div className="mt-4 shrink-0 rounded-[1.5rem] border border-[rgba(24,48,59,0.1)] bg-white/74 p-4 shadow-sm">
                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-2 block">会话标题</span>
                  <input
                    className="min-h-11 w-full rounded-2xl border border-[rgba(24,48,59,0.12)] bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-200/60"
                    onChange={(event) => setTitleDraft(event.target.value)}
                    value={titleDraft}
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isLoading}
                    onClick={() => void handleRenameChat()}
                    type="button"
                  >
                    保存标题
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-[rgba(24,48,59,0.12)] bg-white/90 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30"
                    onClick={() => {
                      setIsRenaming(false);
                      setTitleDraft("");
                    }}
                    type="button"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : null}

            {chatId ? (
              <div className="mt-4 grid shrink-0 gap-2">
                <button
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[rgba(24,48,59,0.12)] bg-white/78 px-4 py-3 text-sm font-medium text-slate-800 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading}
                  onClick={() => {
                    setTitleDraft(activeChat?.title ?? "");
                    setIsRenaming(true);
                    setError(null);
                  }}
                  type="button"
                >
                  重命名当前会话
                </button>
                <button
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-red-200/80 bg-red-50/92 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/40 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading}
                  onClick={() => void handleDeleteChat()}
                  type="button"
                >
                  删除当前会话
                </button>
              </div>
            ) : null}

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              {!isAuthenticated ? (
                <div className="rounded-[1.5rem] border border-dashed border-[rgba(24,48,59,0.18)] bg-white/56 px-4 py-4 text-sm leading-6 text-slate-500">
                  登录后，这里会显示当前账号自己的聊天列表，不会再是全局共享数据。
                </div>
              ) : chats.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-[rgba(24,48,59,0.18)] bg-white/56 px-4 py-4 text-sm leading-6 text-slate-500">
                  还没有历史对话。发出第一条消息后，这里会开始记录你的思路轨迹。
                </div>
              ) : (
                <div className="space-y-2">
                  {chats.map((chat) => {
                    const formattedUpdatedAt = formatChatUpdatedAt(
                      chat.updatedAt,
                    );
                    const isActive = chat.id === chatId;

                    return (
                      <button
                        key={chat.id}
                        className={`w-full rounded-[1.35rem] border px-4 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30 ${
                          isActive
                            ? "border-transparent bg-[linear-gradient(135deg,#18303b,#325869)] text-white shadow-[0_16px_30px_rgba(24,48,59,0.22)]"
                            : "border-[rgba(24,48,59,0.08)] bg-white/76 text-slate-700 hover:bg-white"
                        }`}
                        onClick={() => void loadChatHistory(chat.id)}
                        type="button"
                      >
                        <span className="block font-medium">{chat.title}</span>
                        {formattedUpdatedAt ? (
                          <span
                            className={`mt-1 block text-xs ${
                              isActive ? "text-slate-200" : "text-slate-500"
                            }`}
                          >
                            {formattedUpdatedAt}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-col rounded-[2rem] border border-[rgba(24,48,59,0.1)] bg-white/50 shadow-[0_22px_60px_rgba(24,48,59,0.1)] backdrop-blur-xl">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[rgba(24,48,59,0.08)] px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-500">
                  {isAuthenticated ? "Signed In" : "Signed Out"}
                </p>
                <h2 className="mt-1 truncate text-base font-semibold text-slate-900 sm:text-lg">
                  {isAuthenticated
                    ? chatId
                      ? activeChatTitle
                      : "准备开始新的对话"
                    : "先完成登录或注册"}
                </h2>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                {activeChatUpdatedAt ? (
                  <span className="rounded-full border border-white/70 bg-white/84 px-3 py-1.5 text-xs text-slate-500 shadow-sm">
                    {activeChatUpdatedAt}
                  </span>
                ) : null}
                {isAuthenticated ? (
                  <>
                    <span className="rounded-full border border-white/70 bg-white/84 px-3 py-1.5 text-xs text-slate-500 shadow-sm">
                      {currentUser?.email}
                    </span>
                    <button
                      className="inline-flex min-h-10 items-center justify-center rounded-full border border-[rgba(24,48,59,0.12)] bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30"
                      disabled={isAuthSubmitting}
                      onClick={() => void handleLogout()}
                      type="button"
                    >
                      退出登录
                    </button>
                  </>
                ) : null}
              </div>
            </header>

            <div
              ref={messagesViewportRef}
              aria-label="消息记录"
              aria-live="polite"
              className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6"
              role="log"
            >
              {hasMessages ? (
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
                  {error ? (
                    <div className="rounded-[1.4rem] border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm leading-6 text-red-700 shadow-sm">
                      {error}
                    </div>
                  ) : null}

                  {messages.map((message) => {
                    const isUser = message.role === "user";

                    return (
                      <div
                        key={message.id}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-[1.55rem] px-4 py-3 shadow-sm sm:max-w-[78%] sm:px-5 ${
                            isUser
                              ? "rounded-br-md bg-[linear-gradient(135deg,#f4c78d,#f1dcb6)] text-slate-900"
                              : "rounded-bl-md border border-[rgba(24,48,59,0.08)] bg-white/88 text-slate-700"
                          }`}
                        >
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500/90">
                            {isUser ? "You" : "Assistant"}
                          </p>
                          <p className="whitespace-pre-wrap text-sm leading-7">
                            {message.content}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {isLoading ? (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-[1.55rem] rounded-bl-md border border-[rgba(24,48,59,0.08)] bg-white/84 px-4 py-3 text-sm text-slate-500 shadow-sm sm:max-w-[78%] sm:px-5">
                        正在生成回复...
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : isAuthenticated ? (
                <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center py-8 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.34em] text-slate-500">
                    Thoughtful AI
                  </p>
                  <h3 className="mt-4 font-display text-5xl leading-none tracking-[-0.04em] text-slate-900 sm:text-6xl">
                    A more beautiful place to think
                  </h3>
                  <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
                    把灵感、问题和暂时说不清的想法，都放进这里慢慢整理。
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">
                    这次布局参考了主流 AI 聊天产品常见的方式:
                    把主要高度留给消息区，把欢迎内容压缩到真正空态时才出现。
                  </p>

                  {error ? (
                    <div className="mt-6 w-full rounded-[1.4rem] border border-red-200/80 bg-red-50/90 px-4 py-3 text-left text-sm leading-6 text-red-700 shadow-sm">
                      {error}
                    </div>
                  ) : null}

                  <div className="mt-8 grid w-full gap-3 sm:grid-cols-3">
                    {quickStartIdeas.map((idea) => (
                      <button
                        key={idea}
                        className="cursor-pointer rounded-[1.35rem] border border-[rgba(24,48,59,0.08)] bg-white/82 px-4 py-4 text-left text-sm leading-6 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30"
                        onClick={() => setInput(idea)}
                        type="button"
                      >
                        {idea}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex h-full w-full max-w-xl flex-col justify-center py-8">
                  <div className="rounded-[2rem] border border-[rgba(24,48,59,0.1)] bg-white/82 p-6 shadow-[0_18px_45px_rgba(24,48,59,0.08)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.34em] text-slate-500">
                      Auth Shell
                    </p>
                    <h3 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-slate-900">
                      先登录，再开始真正的服务端聊天流程
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      这一步的重点不是做复杂 UI，而是让你看到：
                      页面首屏数据由服务端根据 cookie 和 session 决定，
                      前端只负责后续交互。
                    </p>

                    <div className="mt-6 flex gap-2">
                      <button
                        className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30 ${
                          authMode === "login"
                            ? "bg-slate-900 text-white"
                            : "border border-[rgba(24,48,59,0.12)] bg-white text-slate-700"
                        }`}
                        onClick={() => {
                          setAuthMode("login");
                          setAuthFeedback(null);
                          setAuthFeedbackTone(null);
                        }}
                        type="button"
                      >
                        登录
                      </button>
                      <button
                        className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30 ${
                          authMode === "register"
                            ? "bg-slate-900 text-white"
                            : "border border-[rgba(24,48,59,0.12)] bg-white text-slate-700"
                        }`}
                        onClick={() => {
                          setAuthMode("register");
                          setAuthFeedback(null);
                          setAuthFeedbackTone(null);
                        }}
                        type="button"
                      >
                        注册
                      </button>
                    </div>

                    <form
                      className="mt-6 space-y-4"
                      onSubmit={handleAuthSubmit}
                    >
                      <label className="block text-sm font-medium text-slate-700">
                        <span className="mb-2 block">邮箱</span>
                        <input
                          autoComplete="email"
                          aria-invalid={hasAuthError ? true : undefined}
                          className={`min-h-11 w-full rounded-2xl border bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:ring-4 ${
                            hasAuthError
                              ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                              : "border-[rgba(24,48,59,0.12)] focus:border-slate-400 focus:ring-slate-200/60"
                          }`}
                          onChange={(event) => {
                            setAuthEmail(event.target.value);
                            if (authFeedback) {
                              setAuthFeedback(null);
                              setAuthFeedbackTone(null);
                            }
                          }}
                          placeholder="alice@example.com"
                          type="email"
                          value={authEmail}
                        />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        <span className="mb-2 block">密码</span>
                        <input
                          autoComplete={
                            authMode === "login"
                              ? "current-password"
                              : "new-password"
                          }
                          aria-invalid={hasAuthError ? true : undefined}
                          className={`min-h-11 w-full rounded-2xl border bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:ring-4 ${
                            hasAuthError
                              ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                              : "border-[rgba(24,48,59,0.12)] focus:border-slate-400 focus:ring-slate-200/60"
                          }`}
                          onChange={(event) => {
                            setAuthPassword(event.target.value);
                            if (authFeedback) {
                              setAuthFeedback(null);
                              setAuthFeedbackTone(null);
                            }
                          }}
                          placeholder="至少 8 位"
                          type="password"
                          value={authPassword}
                        />
                      </label>

                      {authFeedback ? (
                        <div
                          className={`rounded-[1.25rem] border px-4 py-3 text-sm leading-6 ${
                            authFeedbackTone === "error"
                              ? "border-red-200/80 bg-red-50/90 text-red-700"
                              : "border-emerald-200/80 bg-emerald-50/90 text-emerald-700"
                          }`}
                          role={
                            authFeedbackTone === "error" ? "alert" : "status"
                          }
                        >
                          {authFeedback}
                        </div>
                      ) : null}

                      <button
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[linear-gradient(135deg,#18303b,#325869)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(24,48,59,0.2)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_32px_rgba(24,48,59,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                        disabled={isAuthSubmitting}
                        type="submit"
                      >
                        {isAuthSubmitting
                          ? "提交中..."
                          : authMode === "login"
                            ? "登录并刷新页面"
                            : "注册账号"}
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>

            <form
              className="shrink-0 border-t border-[rgba(24,48,59,0.08)] px-4 py-4 sm:px-6"
              onSubmit={handleSubmit}
            >
              <div className="mx-auto w-full max-w-4xl">
                <label
                  className="text-sm font-medium text-slate-700"
                  htmlFor="chat-input"
                >
                  请输入消息
                </label>
                <div className="mt-3 rounded-[1.7rem] border border-[rgba(24,48,59,0.1)] bg-white/88 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <textarea
                    id="chat-input"
                    className="min-h-24 max-h-56 w-full resize-none rounded-[1.2rem] bg-transparent px-2 py-2 text-sm leading-7 text-slate-900 outline-none placeholder:text-slate-400"
                    disabled={!isAuthenticated || isLoading}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder={
                      isAuthenticated
                        ? "比如：帮我把今天的想法梳理成更清楚的三个重点"
                        : "先登录后再开始聊天"
                    }
                    value={input}
                  />
                  <div className="mt-3 flex flex-col gap-3 border-t border-[rgba(24,48,59,0.08)] pt-3 sm:flex-row sm:items-end sm:justify-between">
                    <p className="max-w-xl text-xs leading-6 text-slate-500">
                      {isAuthenticated
                        ? "当前回复来自服务端模型流式输出，聊天记录会继续保存到 PostgreSQL，方便你回到同一段上下文。"
                        : "现在这块输入区故意保留在页面里，是为了让你看到：未登录时前端可以渲染，但真正能不能聊天，仍由服务端会话决定。"}
                    </p>
                    <button
                      className="inline-flex min-h-11 items-center justify-center rounded-full bg-[linear-gradient(135deg,#18303b,#325869)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(24,48,59,0.2)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_32px_rgba(24,48,59,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                      disabled={!isAuthenticated || isLoading}
                      type="submit"
                    >
                      {isLoading ? "发送中..." : "发送"}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
