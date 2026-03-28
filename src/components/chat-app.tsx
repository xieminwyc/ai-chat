"use client";

import dayjs from "dayjs";
import { FormEvent, useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatSummary = {
  id: string;
  title: string;
  updatedAt?: string;
};

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

export function ChatApp() {
  const [input, setInput] = useState("");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const activeChat = chats.find((chat) => chat.id === chatId);
  const activeChatTitle = activeChat?.title ?? "新的对话";
  const activeChatUpdatedAt = formatChatUpdatedAt(activeChat?.updatedAt);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    messagesViewportRef.current?.scrollTo({
      top: messagesViewportRef.current.scrollHeight,
      behavior: "auto",
    });
  }, [messages]);

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

  useEffect(() => {
    async function initializeChatApp() {
      try {
        const listResponse = await fetch("/api/chat");
        const listData = (await listResponse.json()) as {
          chats?: ChatSummary[];
          error?: string;
        };

        if (!listResponse.ok) {
          throw new Error(listData.error || "读取会话列表失败");
        }

        setChats(listData.chats ?? []);

        // 首次打开页面时，优先相信 URL 里的 chatId；没有再回退到本地缓存。
        const savedChatId =
          new URL(window.location.href).searchParams.get("chatId") ??
          window.localStorage.getItem("activeChatId");

        if (!savedChatId) {
          return;
        }

        const historyResponse = await fetch(`/api/chat?chatId=${savedChatId}`);
        const historyData = (await historyResponse.json()) as {
          error?: string;
          messages?: ChatMessage[];
        };

        if (!historyResponse.ok) {
          throw new Error(historyData.error || "读取历史消息失败");
        }

        setMessages(historyData.messages ?? []);
        setChatId(savedChatId);
        window.localStorage.setItem("activeChatId", savedChatId);
        syncChatIdToUrl(savedChatId);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "初始化聊天页面时出错了",
        );
      }
    }

    void initializeChatApp();
  }, []);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = input.trim();
    if (!message) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const assistantMessageId = crypto.randomUUID();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chatId, message }),
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
                更接近真实聊天工具的布局，主要空间留给对话本身。
              </p>
              <button
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[linear-gradient(135deg,#18303b,#355b6d)] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(24,48,59,0.24)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_32px_rgba(24,48,59,0.26)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40 disabled:cursor-not-allowed disabled:opacity-60"
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
              {chats.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-[rgba(24,48,59,0.18)] bg-white/56 px-4 py-4 text-sm leading-6 text-slate-500">
                  还没有历史对话。发出第一条消息后，这里会开始记录你的思路轨迹。
                </div>
              ) : (
                <div className="space-y-2">
                  {chats.map((chat) => {
                    const formattedUpdatedAt = formatChatUpdatedAt(chat.updatedAt);
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
                  Thoughtful AI
                </p>
                <h2 className="mt-1 truncate text-base font-semibold text-slate-900 sm:text-lg">
                  {chatId ? activeChatTitle : "准备开始新的对话"}
                </h2>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                {activeChatUpdatedAt ? (
                  <span className="rounded-full border border-white/70 bg-white/84 px-3 py-1.5 text-xs text-slate-500 shadow-sm">
                    {activeChatUpdatedAt}
                  </span>
                ) : null}
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,#18303b,#355b6d)] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_22px_rgba(24,48,59,0.2)] transition hover:translate-y-[-1px] hover:shadow-[0_16px_28px_rgba(24,48,59,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40 lg:hidden"
                  onClick={handleStartNewChat}
                  type="button"
                >
                  开始新对话
                </button>
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
              ) : (
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
                    这次布局参考了主流 AI 聊天产品常见的方式: 把主要高度留给消息区，把欢迎内容压缩到真正空态时才出现。
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
              )}
            </div>

            <form
              className="shrink-0 border-t border-[rgba(24,48,59,0.08)] px-4 py-4 sm:px-6"
              onSubmit={handleSubmit}
            >
              <div className="mx-auto w-full max-w-4xl">
                <label className="text-sm font-medium text-slate-700" htmlFor="chat-input">
                  请输入消息
                </label>
                <div className="mt-3 rounded-[1.7rem] border border-[rgba(24,48,59,0.1)] bg-white/88 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <textarea
                    id="chat-input"
                    className="min-h-24 max-h-56 w-full resize-none rounded-[1.2rem] bg-transparent px-2 py-2 text-sm leading-7 text-slate-900 outline-none placeholder:text-slate-400"
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="比如：帮我把今天的想法梳理成更清楚的三个重点"
                    value={input}
                  />
                  <div className="mt-3 flex flex-col gap-3 border-t border-[rgba(24,48,59,0.08)] pt-3 sm:flex-row sm:items-end sm:justify-between">
                    <p className="max-w-xl text-xs leading-6 text-slate-500">
                      当前回复来自服务端 SiliconFlow 模型流式输出，聊天记录会继续保存到
                      PostgreSQL，方便你回到同一段上下文。
                    </p>
                    <button
                      className="inline-flex min-h-11 items-center justify-center rounded-full bg-[linear-gradient(135deg,#18303b,#325869)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(24,48,59,0.2)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_32px_rgba(24,48,59,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                      disabled={isLoading}
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
