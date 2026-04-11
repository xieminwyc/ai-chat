import dayjs from "dayjs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatApp } from "@/components/chat-app";
import type { HomePageData } from "@/server/page/home-data";

function createInitialData(
  overrides: Partial<HomePageData> = {},
): HomePageData {
  return {
    viewerKind: "user",
    isAuthenticated: true,
    currentUser: {
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: "2026-04-08T03:00:00.000Z",
      isEmailVerified: true,
      createdAt: "2026-04-08T01:00:00.000Z",
      updatedAt: "2026-04-08T01:00:00.000Z",
    },
    mergeCandidate: null,
    guestSession: null,
    initialChats: [],
    initialMessages: [],
    initialChatId: null,
    ...overrides,
  };
}

function createGuestData(
  overrides: Partial<HomePageData> = {},
): HomePageData {
  return createInitialData({
    viewerKind: "guest",
    isAuthenticated: false,
    currentUser: null,
    guestSession: {
      id: "guest_1",
      trialMessageCount: 0,
      messageLimit: 3,
    },
    ...overrides,
  });
}

describe("ChatApp", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("renders the premium empty state from server-provided bootstrap data", () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    render(<ChatApp initialData={createInitialData()} />);

    expect(
      screen.getByText("A more beautiful place to think"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "把灵感、问题和暂时说不清的想法，都放进这里慢慢整理。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Empty workspace"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Quick start prompts"),
    ).toBeInTheDocument();
    expect(screen.getByText("Private by default")).toBeInTheDocument();
    expect(screen.getByText("Thoughtful flow")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the signed-out auth shell and blocks message input", () => {
    render(
      <ChatApp
        initialData={createInitialData({
          viewerKind: "user",
          isAuthenticated: false,
          currentUser: null,
          guestSession: null,
        })}
      />,
    );

    expect(
      screen.getByText("先登录，再开始真正的服务端聊天流程"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Private workspace"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("为账号、会话和思考过程预留一个安静且可恢复的空间。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("保留你自己的历史对话和上下文"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("让会话切换、刷新与恢复更加稳定"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "注册" })).toBeInTheDocument();
  });

  it("shows a verification-required state for authenticated but unverified users", () => {
    render(
      <ChatApp
        initialData={createInitialData({
          currentUser: {
            id: "user_1",
            email: "alice@example.com",
            emailVerifiedAt: null,
            isEmailVerified: false,
            createdAt: "2026-04-08T01:00:00.000Z",
            updatedAt: "2026-04-08T01:00:00.000Z",
          },
        })}
      />,
    );

    expect(screen.getByText("请先验证邮箱")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
  });

  it("shows account and settings links for verified users in the header action area", () => {
    render(<ChatApp initialData={createInitialData()} />);

    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("shows account access but keeps settings visually locked for unverified users", () => {
    render(
      <ChatApp
        initialData={createInitialData({
          currentUser: {
            id: "user_1",
            email: "alice@example.com",
            emailVerifiedAt: null,
            isEmailVerified: false,
            createdAt: "2026-04-08T01:00:00.000Z",
            updatedAt: "2026-04-08T01:00:00.000Z",
          },
        })}
      />,
    );

    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(
      screen.getByText("验证邮箱后可进入 Settings"),
    ).toBeInTheDocument();
  });

  it("lets an authenticated unverified user resend the verification email", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 202,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    render(
      <ChatApp
        initialData={createInitialData({
          currentUser: {
            id: "user_1",
            email: "alice@example.com",
            emailVerifiedAt: null,
            isEmailVerified: false,
            createdAt: "2026-04-08T01:00:00.000Z",
            updatedAt: "2026-04-08T01:00:00.000Z",
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "重新发送验证邮件" }));

    expect(global.fetch).toHaveBeenCalledWith("/api/auth/resend-verification", {
      method: "POST",
    });
    expect(
      await screen.findByText("验证邮件已重新发送，请检查邮箱。"),
    ).toBeInTheDocument();
  });

  it("shows a merge prompt when a verified user has guest history available", () => {
    render(
      <ChatApp
        initialData={createInitialData({
          mergeCandidate: {
            guestSessionId: "guest_1",
            trialMessageCount: 2,
          },
        })}
      />,
    );

    expect(screen.getByText("检测到游客历史")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "合并当前游客历史" }),
    ).toBeInTheDocument();
  });

  it("merges guest history and refreshes the workspace state", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, mergedChatCount: 2 }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    render(
      <ChatApp
        initialData={createInitialData({
          mergeCandidate: {
            guestSessionId: "guest_1",
            trialMessageCount: 2,
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "合并当前游客历史" }));

    expect(global.fetch).toHaveBeenCalledWith("/api/guest/merge", {
      method: "POST",
    });
    expect(
      await screen.findByText("游客历史已合并到当前账号。"),
    ).toBeInTheDocument();
  });

  it("hides the merge prompt when the user chooses not to merge yet", async () => {
    const user = userEvent.setup();

    render(
      <ChatApp
        initialData={createInitialData({
          mergeCandidate: {
            guestSessionId: "guest_1",
            trialMessageCount: 2,
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "暂不合并" }));

    expect(screen.queryByText("检测到游客历史")).not.toBeInTheDocument();
  });

  it("renders a usable guest workspace instead of forcing the auth shell", () => {
    render(
      <ChatApp
        initialData={createGuestData({
          guestSession: {
            id: "guest_1",
            trialMessageCount: 1,
            messageLimit: 3,
          },
        })}
      />,
    );

    expect((screen.getAllByText("游客试用还剩 2 次")).length).toBeGreaterThan(0);
    expect(
      screen.queryByText("先登录，再开始真正的服务端聊天流程"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "注册" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Account" })).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("keeps the guest workspace available before a cookie-backed guest session exists", () => {
    render(
      <ChatApp
        initialData={createGuestData({
          guestSession: null,
          initialChats: [],
          initialMessages: [],
        })}
      />,
    );

    expect((screen.getAllByText("游客试用还剩 3 次")).length).toBeGreaterThan(0);
    expect(
      screen.queryByText("先登录，再开始真正的服务端聊天流程"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "注册" })).toBeInTheDocument();
  });

  it("lets a guest send messages before the quota is exhausted", async () => {
    const user = userEvent.setup();
    let chatListRequestCount = 0;
    let postBody: string | null = null;

    vi.spyOn(global, "fetch").mockImplementation((input, init) => {
      const url = String(input);

      if (url === "/api/chat" && init?.method === "POST") {
        postBody = String(init.body ?? "");
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("游客回复"));
            controller.close();
          },
        });

        return Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: {
              "x-chat-id": "chat_guest_1",
            },
          }),
        );
      }

      if (url === "/api/chat") {
        chatListRequestCount += 1;

        return Promise.resolve({
          ok: true,
          json: async () => ({
            chats: [
              {
                id: "chat_guest_1",
                title: "游客会话",
                updatedAt: "2026-03-25T03:06:31.474Z",
              },
            ],
          }),
        } as Response);
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    render(<ChatApp initialData={createGuestData()} />);

    await user.type(screen.getByLabelText("请输入消息"), "游客测试消息");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("游客测试消息")).toBeInTheDocument();
    expect(await screen.findByText("游客回复")).toBeInTheDocument();
    expect((screen.getAllByText("游客试用还剩 2 次")).length).toBeGreaterThan(0);
    expect(postBody).toBe(JSON.stringify({ message: "游客测试消息" }));
    expect(chatListRequestCount).toBe(1);
  });

  it("creates local guest UI state after the first anonymous message succeeds", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockImplementation((input, init) => {
      const url = String(input);

      if (url === "/api/chat" && init?.method === "POST") {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("游客回复"));
            controller.close();
          },
        });

        return Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: {
              "x-chat-id": "chat_guest_1",
            },
          }),
        );
      }

      if (url === "/api/chat") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chats: [
              {
                id: "chat_guest_1",
                title: "游客会话",
                updatedAt: "2026-03-25T03:06:31.474Z",
              },
            ],
          }),
        } as Response);
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    render(
      <ChatApp
        initialData={createGuestData({
          guestSession: null,
        })}
      />,
    );

    await user.type(screen.getByLabelText("请输入消息"), "第一次游客消息");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("游客回复")).toBeInTheDocument();
    expect((screen.getAllByText("游客试用还剩 2 次")).length).toBeGreaterThan(0);
  });

  it("keeps guest history visible and disables send when the quota is exhausted", () => {
    render(
      <ChatApp
        initialData={createGuestData({
          guestSession: {
            id: "guest_1",
            trialMessageCount: 3,
            messageLimit: 3,
          },
          initialMessages: [
            {
              id: "message_1",
              role: "assistant",
              content: "游客历史消息",
              createdAt: "2026-03-24T11:20:52.268Z",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("游客历史消息")).toBeInTheDocument();
    expect(
      (screen.getAllByText("游客试用次数已用完，注册后可继续聊天并保存历史"))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "注册" })).toBeInTheDocument();
  });

  it("shows login and register actions when guest quota is exhausted in the empty state", () => {
    render(
      <ChatApp
        initialData={createGuestData({
          guestSession: {
            id: "guest_1",
            trialMessageCount: 3,
            messageLimit: 3,
          },
          initialMessages: [],
        })}
      />,
    );

    expect(
      (screen.getAllByText("游客试用次数已用完，注册后可继续聊天并保存历史"))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "注册" })).toBeInTheDocument();
  });

  it("shows the guest upgrade CTA instead of the session-expired UI when guest quota is rejected", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: "Guest trial limit reached. Please register to continue.",
      }),
    } as Response);

    render(
      <ChatApp
        initialData={createGuestData({
          guestSession: {
            id: "guest_1",
            trialMessageCount: 2,
            messageLimit: 3,
          },
          initialMessages: [
            {
              id: "message_1",
              role: "assistant",
              content: "还留着的游客历史",
              createdAt: "2026-03-24T11:20:52.268Z",
            },
          ],
        })}
      />,
    );

    await user.type(screen.getByLabelText("请输入消息"), "最后一次游客消息");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("还留着的游客历史")).toBeInTheDocument();
    expect(
      (screen.getAllByText("游客试用次数已用完，注册后可继续聊天并保存历史"))
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("登录状态已失效，请重新登录。"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
  });

  it("submits the register form and shows success feedback", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        user: {
          id: "user_2",
          email: "new@example.com",
        },
      }),
    } as Response);

    render(
      <ChatApp
        initialData={createInitialData({
          viewerKind: "user",
          isAuthenticated: false,
          currentUser: null,
          guestSession: null,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "注册" }));
    await user.type(screen.getByLabelText("邮箱"), "new@example.com");
    await user.type(screen.getByLabelText("密码"), "password123");
    await user.click(screen.getByRole("button", { name: "注册账号" }));

    expect(global.fetch).toHaveBeenCalledWith("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "new@example.com",
        password: "password123",
      }),
    });
    expect(
      await screen.findByText("注册成功，现在可以直接登录了。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toHaveClass(
      "bg-slate-900",
    );
    expect(screen.getByLabelText("邮箱")).toHaveValue("new@example.com");
    expect(screen.getByLabelText("密码")).toHaveValue("");
  });

  it("shows a clear Chinese hint when login fails", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "Invalid email or password",
      }),
    } as Response);

    render(
      <ChatApp
        initialData={createInitialData({
          viewerKind: "user",
          isAuthenticated: false,
          currentUser: null,
          guestSession: null,
        })}
      />,
    );

    await user.type(screen.getByLabelText("邮箱"), "alice@example.com");
    await user.type(screen.getByLabelText("密码"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "登录并刷新页面" }));

    expect(
      await screen.findByText(
        "邮箱或密码不正确。如果你还没注册，可以先切到“注册”创建账号。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("邮箱")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("密码")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a forgot-password entry in login mode", () => {
    render(
      <ChatApp
        initialData={createInitialData({
          viewerKind: "user",
          isAuthenticated: false,
          currentUser: null,
          guestSession: null,
        })}
      />,
    );

    expect(
      screen.getByRole("button", { name: "忘记密码？" }),
    ).toBeInTheDocument();
  });

  it("switches to the forgot-password request view and back to login", async () => {
    const user = userEvent.setup();

    render(
      <ChatApp
        initialData={createInitialData({
          viewerKind: "user",
          isAuthenticated: false,
          currentUser: null,
          guestSession: null,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "忘记密码？" }));

    expect(screen.getByText("找回你的账号密码")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "发送重置邮件" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("密码")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回登录" }));

    expect(screen.getByRole("button", { name: "登录并刷新页面" })).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
  });

  it("submits forgot-password and shows the unified success copy", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: "如果该邮箱已注册，我们会向你发送重置密码邮件。",
      }),
    } as Response);

    render(
      <ChatApp
        initialData={createInitialData({
          viewerKind: "user",
          isAuthenticated: false,
          currentUser: null,
          guestSession: null,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "忘记密码？" }));
    await user.type(screen.getByLabelText("邮箱"), "alice@example.com");
    await user.click(screen.getByRole("button", { name: "发送重置邮件" }));

    expect(global.fetch).toHaveBeenCalledWith("/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "alice@example.com",
      }),
    });
    expect(
      await screen.findByText("如果该邮箱已注册，我们会向你发送重置密码邮件。"),
    ).toBeInTheDocument();
  });

  it("auto-scrolls the message viewport when initial history is provided", async () => {
    const scrollTo = vi.fn();

    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return 960;
      },
    });

    render(
      <ChatApp
        initialData={createInitialData({
          initialChats: [{ id: "chat_1", title: "之前的会话" }],
          initialMessages: [
            {
              id: "message_1",
              role: "user",
              content: "之前的问题",
              createdAt: "2026-03-24T11:20:51.268Z",
            },
            {
              id: "message_2",
              role: "assistant",
              content: "之前的回复",
              createdAt: "2026-03-24T11:20:52.268Z",
            },
          ],
          initialChatId: "chat_1",
        })}
      />,
    );

    expect(await screen.findByText("之前的回复")).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({
      top: 960,
      behavior: "auto",
    });
  });

  it("restores a saved active chat from localStorage without refetching the chat list", async () => {
    window.localStorage.setItem("activeChatId", "chat_1");

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        chatId: "chat_1",
        messages: [
          {
            id: "message_1",
            role: "user",
            content: "之前的问题",
          },
          {
            id: "message_2",
            role: "assistant",
            content: "之前的回复",
          },
        ],
      }),
    } as Response);

    render(
      <ChatApp
        initialData={createInitialData({
          initialChats: [{ id: "chat_1", title: "之前的会话" }],
        })}
      />,
    );

    expect(await screen.findByText("之前的问题")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/chat?chatId=chat_1");
  });

  it("syncs the server-selected chat id into localStorage on first render", async () => {
    window.localStorage.setItem("activeChatId", "chat_old");

    render(
      <ChatApp
        initialData={createInitialData({
          initialChats: [{ id: "chat_1", title: "首屏会话" }],
          initialMessages: [
            {
              id: "message_1",
              role: "assistant",
              content: "服务端已经带下来的首屏消息",
              createdAt: "2026-03-24T11:20:52.268Z",
            },
          ],
          initialChatId: "chat_1",
        })}
      />,
    );

    expect(await screen.findByText("服务端已经带下来的首屏消息")).toBeInTheDocument();
    expect(window.localStorage.getItem("activeChatId")).toBe("chat_1");
  });

  it("submits a message and renders the streamed assistant reply", async () => {
    const user = userEvent.setup();
    let chatListRequestCount = 0;
    let postBody: string | null = null;

    vi.spyOn(global, "fetch").mockImplementation((input, init) => {
      const url = String(input);

      if (url === "/api/chat" && init?.method === "POST") {
        postBody = String(init.body ?? "");
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                "可以先从 Next.js 的页面、布局和接口路由开始学起。",
              ),
            );
            controller.close();
          },
        });

        return Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: {
              "x-chat-id": "chat_1",
            },
          }),
        );
      }

      if (url === "/api/chat") {
        chatListRequestCount += 1;

        return Promise.resolve({
          ok: true,
          json: async () => ({
            chats: [
              {
                id: "chat_1",
                title: "新会话",
                updatedAt: "2026-03-25T03:06:31.474Z",
              },
            ],
          }),
        } as Response);
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    render(<ChatApp initialData={createInitialData()} />);

    await user.type(screen.getByLabelText("请输入消息"), "测试消息");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("测试消息")).toBeInTheDocument();
    expect(
      await screen.findByText("可以先从 Next.js 的页面、布局和接口路由开始学起。"),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem("activeChatId")).toBe("chat_1");
    expect(chatListRequestCount).toBe(1);
    expect(postBody).toBe(JSON.stringify({ message: "测试消息" }));
  });

  it("renders the backend error message when the request fails", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "数据库暂时不可用",
      }),
    } as Response);

    render(<ChatApp initialData={createInitialData()} />);

    await user.type(screen.getByLabelText("请输入消息"), "测试消息");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("数据库暂时不可用")).toBeInTheDocument();
  });

  it("preserves the current conversation and shows re-login actions when chat returns 401", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("activeChatId", "chat_1");

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: "登录状态已失效，请重新登录。",
      }),
    } as Response);

    render(
      <ChatApp
        initialData={createInitialData({
          initialChats: [{ id: "chat_1", title: "原来的会话" }],
          initialMessages: [
            {
              id: "message_1",
              role: "assistant",
              content: "之前已经有一条历史消息",
              createdAt: "2026-03-24T11:20:52.268Z",
            },
          ],
          initialChatId: "chat_1",
        })}
      />,
    );

    await user.type(screen.getByLabelText("请输入消息"), "测试消息");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(
      (await screen.findAllByText("登录状态已失效，请重新登录。")).length,
    ).toBeGreaterThan(1);
    expect(screen.getByText("之前已经有一条历史消息")).toBeInTheDocument();
    expect(screen.getByText("测试消息")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(window.localStorage.getItem("activeChatId")).toBeNull();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
  });

  it("loads the clicked conversation from the server", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);

      if (url === "/api/chat?chatId=chat_2") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chatId: "chat_2",
            messages: [
              {
                id: "message_3",
                role: "user",
                content: "数据库要先学什么",
              },
            ],
          }),
        } as Response);
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    render(
      <ChatApp
        initialData={createInitialData({
          initialChats: [
            { id: "chat_1", title: "Next.js 学习" },
            { id: "chat_2", title: "数据库复盘" },
          ],
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "数据库复盘" }));

    expect(await screen.findByText("数据库要先学什么")).toBeInTheDocument();
    expect(window.localStorage.getItem("activeChatId")).toBe("chat_2");
    expect(window.location.search).toBe("?chatId=chat_2");
  });

  it("keeps the chat order returned by the backend bootstrap", async () => {
    render(
      <ChatApp
        initialData={createInitialData({
          initialChats: [
            {
              id: "chat_older",
              title: "后端给的第一项",
              updatedAt: "2026-03-24T10:00:00.000Z",
            },
            {
              id: "chat_newer",
              title: "后端给的第二项",
              updatedAt: "2026-03-25T10:00:00.000Z",
            },
          ],
        })}
      />,
    );

    expect(await screen.findByText("后端给的第一项")).toBeInTheDocument();
    expect(screen.getByText("后端给的第二项")).toBeInTheDocument();

    const chatButtons = screen
      .getAllByRole("button")
      .filter(
        (button) =>
          button.textContent?.includes("后端给的第一项") ||
          button.textContent?.includes("后端给的第二项"),
      );

    expect(
      chatButtons.map((button) =>
        button.textContent?.includes("后端给的第一项")
          ? "后端给的第一项"
          : "后端给的第二项",
      ),
    ).toEqual(["后端给的第一项", "后端给的第二项"]);
  });

  it("shows a formatted updated time for each chat", async () => {
    const updatedAt = "2026-03-25T03:06:31.474Z";

    render(
      <ChatApp
        initialData={createInitialData({
          initialChats: [
            {
              id: "chat_1",
              title: "带时间的会话",
              updatedAt,
            },
          ],
        })}
      />,
    );

    expect(await screen.findByText("带时间的会话")).toBeInTheDocument();
    expect(
      screen.getByText(dayjs(updatedAt).format("YYYY-MM-DD HH:mm")),
    ).toBeInTheDocument();
  });

  it("starts a fresh chat when clicking the new chat button", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("activeChatId", "chat_1");

    render(
      <ChatApp
        initialData={createInitialData({
          initialChats: [{ id: "chat_1", title: "旧会话" }],
          initialMessages: [
            {
              id: "message_1",
              role: "user",
              content: "旧消息",
              createdAt: "2026-03-24T11:20:51.268Z",
            },
          ],
          initialChatId: "chat_1",
        })}
      />,
    );

    expect(await screen.findByText("旧消息")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "新建聊天" })[0]);

    expect(screen.queryByText("旧消息")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("activeChatId")).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("deletes the active chat and clears the current conversation", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("activeChatId", "chat_1");

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
      }),
    } as Response);

    render(
      <ChatApp
        initialData={createInitialData({
          initialChats: [{ id: "chat_1", title: "要删除的会话" }],
          initialMessages: [
            {
              id: "message_1",
              role: "user",
              content: "旧消息",
              createdAt: "2026-03-24T11:20:51.268Z",
            },
          ],
          initialChatId: "chat_1",
        })}
      />,
    );

    expect(await screen.findByText("旧消息")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "删除当前会话" }));

    expect(screen.queryByText("旧消息")).not.toBeInTheDocument();
    expect(screen.queryByText("要删除的会话")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("activeChatId")).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("renames the active chat title and refreshes the sidebar list", async () => {
    const user = userEvent.setup();
    let chatListRequestCount = 0;

    vi.spyOn(global, "fetch").mockImplementation((input, init) => {
      const url = String(input);

      if (url === "/api/chat?chatId=chat_1" && init?.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chat: {
              id: "chat_1",
              title: "新的标题",
            },
          }),
        } as Response);
      }

      if (url === "/api/chat") {
        chatListRequestCount += 1;

        return Promise.resolve({
          ok: true,
          json: async () => ({
            chats: [
              { id: "chat_1", title: "新的标题" },
              { id: "chat_2", title: "另一个会话" },
            ],
          }),
        } as Response);
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    render(
      <ChatApp
        initialData={createInitialData({
          initialChats: [
            { id: "chat_2", title: "另一个会话" },
            { id: "chat_1", title: "旧标题" },
          ],
          initialChatId: "chat_1",
        })}
      />,
    );

    expect((await screen.findAllByText("旧标题")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "重命名当前会话" }));
    await user.clear(screen.getByLabelText("会话标题"));
    await user.type(screen.getByLabelText("会话标题"), "新的标题");
    await user.click(screen.getByRole("button", { name: "保存标题" }));

    expect((await screen.findAllByText("新的标题")).length).toBeGreaterThan(0);
    expect(screen.queryByText("旧标题")).not.toBeInTheDocument();
    expect(chatListRequestCount).toBe(1);
  });
});
