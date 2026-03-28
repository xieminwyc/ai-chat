import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatApp } from "@/components/chat-app";

describe("ChatApp", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("renders the premium empty state on first load", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        chats: [],
      }),
    } as Response);

    render(<ChatApp />);

    expect(
      (await screen.findAllByText("A more beautiful place to think")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("把灵感、问题和暂时说不清的想法，都放进这里慢慢整理。"),
    ).toBeInTheDocument();
  });

  it("shows the refreshed empty chat history guidance", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        chats: [],
      }),
    } as Response);

    render(<ChatApp />);

    expect(
      await screen.findByText(
        "还没有历史对话。发出第一条消息后，这里会开始记录你的思路轨迹。",
      ),
    ).toBeInTheDocument();
  });

  it("auto-scrolls the message viewport when history is loaded", async () => {
    window.localStorage.setItem("activeChatId", "chat_1");
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

    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);

      if (url === "/api/chat") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chats: [{ id: "chat_1", title: "之前的会话" }],
          }),
        } as Response);
      }

      return Promise.resolve({
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
    });

    render(<ChatApp />);

    expect(await screen.findByText("之前的回复")).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({
      top: 960,
      behavior: "auto",
    });
  });

  it("submits a message and renders the streamed assistant reply", async () => {
    const user = userEvent.setup();
    let chatListRequestCount = 0;

    vi.spyOn(global, "fetch").mockImplementation((input, init) => {
      const url = String(input);

      if (url === "/api/chat" && init?.method === "POST") {
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
            chats:
              chatListRequestCount === 1
                ? []
                : [
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

    render(<ChatApp />);

    await user.type(screen.getByLabelText("请输入消息"), "测试消息");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("测试消息")).toBeInTheDocument();
    expect(
      await screen.findByText("可以先从 Next.js 的页面、布局和接口路由开始学起。"),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem("activeChatId")).toBe("chat_1");
    expect(chatListRequestCount).toBe(2);
  });

  it("renders the backend error message when the request fails", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "数据库暂时不可用",
      }),
    } as Response);

    render(<ChatApp />);

    await user.type(screen.getByLabelText("请输入消息"), "测试消息");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("数据库暂时不可用")).toBeInTheDocument();
  });

  it("loads message history when an active chat id exists", async () => {
    window.localStorage.setItem("activeChatId", "chat_1");

    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);

      if (url === "/api/chat") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chats: [
              {
                id: "chat_1",
                title: "之前的会话",
              },
            ],
          }),
        } as Response);
      }

      return Promise.resolve({
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
    });

    render(<ChatApp />);

    expect(await screen.findByText("之前的问题")).toBeInTheDocument();
    expect(await screen.findByText("之前的回复")).toBeInTheDocument();
    expect((await screen.findAllByText("之前的会话")).length).toBeGreaterThan(0);
  });

  it("prefers chatId from the url when opening the page", async () => {
    window.history.pushState(null, "", "/?chatId=chat_2");

    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);

      if (url === "/api/chat") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chats: [{ id: "chat_2", title: "URL 会话" }],
          }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          chatId: "chat_2",
          messages: [
            {
              id: "message_1",
              role: "assistant",
              content: "我是从 URL 打开的会话",
            },
          ],
        }),
      } as Response);
    });

    render(<ChatApp />);

    expect(await screen.findByText("我是从 URL 打开的会话")).toBeInTheDocument();
    expect(window.localStorage.getItem("activeChatId")).toBe("chat_2");
  });

  it("loads chat list and switches to the clicked conversation", async () => {
    const user = userEvent.setup();

    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);

      if (url === "/api/chat") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chats: [
              { id: "chat_1", title: "Next.js 学习" },
              { id: "chat_2", title: "数据库复盘" },
            ],
          }),
        } as Response);
      }

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

      return Promise.resolve({
        ok: true,
        json: async () => ({
          chatId: "chat_1",
          messages: [],
        }),
      } as Response);
    });

    render(<ChatApp />);

    await user.click(await screen.findByRole("button", { name: "数据库复盘" }));

    expect(await screen.findByText("数据库要先学什么")).toBeInTheDocument();
    expect(window.localStorage.getItem("activeChatId")).toBe("chat_2");
    expect(window.location.search).toBe("?chatId=chat_2");
  });

  it("keeps the chat order returned by the backend", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        chats: [
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
      }),
    } as Response);

    render(<ChatApp />);

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
    ).toEqual([
      "后端给的第一项",
      "后端给的第二项",
    ]);
  });

  it("shows a formatted updated time for each chat", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        chats: [
          {
            id: "chat_1",
            title: "带时间的会话",
            updatedAt: "2026-03-25T03:06:31.474Z",
          },
        ],
      }),
    } as Response);

    render(<ChatApp />);

    expect(await screen.findByText("带时间的会话")).toBeInTheDocument();
    expect(screen.getByText("2026-03-25 11:06")).toBeInTheDocument();
  });

  it("starts a fresh chat when clicking the new chat button", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("activeChatId", "chat_1");

    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);

      if (url === "/api/chat") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chats: [{ id: "chat_1", title: "旧会话" }],
          }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          chatId: "chat_1",
          messages: [
            {
              id: "message_1",
              role: "user",
              content: "旧消息",
            },
          ],
        }),
      } as Response);
    });

    render(<ChatApp />);
    expect(await screen.findByText("旧消息")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "新建聊天" })[0]);

    expect(screen.queryByText("旧消息")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("activeChatId")).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("deletes the active chat and clears the current conversation", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("activeChatId", "chat_1");

    vi.spyOn(global, "fetch").mockImplementation((input, init) => {
      const url = String(input);

      if (url === "/api/chat") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chats: [{ id: "chat_1", title: "要删除的会话" }],
          }),
        } as Response);
      }

      if (url === "/api/chat?chatId=chat_1" && !init?.method) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chatId: "chat_1",
            messages: [
              {
                id: "message_1",
                role: "user",
                content: "旧消息",
              },
            ],
          }),
        } as Response);
      }

      if (url === "/api/chat?chatId=chat_1" && init?.method === "DELETE") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
          }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          chats: [],
        }),
      } as Response);
    });

    render(<ChatApp />);
    expect(await screen.findByText("旧消息")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "删除当前会话" }));

    expect(screen.queryByText("旧消息")).not.toBeInTheDocument();
    expect(screen.queryByText("要删除的会话")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("activeChatId")).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("renames the active chat title", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("activeChatId", "chat_1");
    let chatListRequestCount = 0;

    vi.spyOn(global, "fetch").mockImplementation((input, init) => {
      const url = String(input);

      if (url === "/api/chat") {
        chatListRequestCount += 1;

        return Promise.resolve({
          ok: true,
          json: async () => ({
            chats:
              chatListRequestCount === 1
                ? [
                    { id: "chat_2", title: "另一个会话" },
                    { id: "chat_1", title: "旧标题" },
                  ]
                : [
                    { id: "chat_1", title: "新的标题" },
                    { id: "chat_2", title: "另一个会话" },
                  ],
          }),
        } as Response);
      }

      if (url === "/api/chat?chatId=chat_1" && !init?.method) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chatId: "chat_1",
            messages: [],
          }),
        } as Response);
      }

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

      return Promise.resolve({
        ok: true,
        json: async () => ({ chats: [] }),
      } as Response);
    });

    render(<ChatApp />);
    expect((await screen.findAllByText("旧标题")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "重命名当前会话" }));
    await user.clear(screen.getByLabelText("会话标题"));
    await user.type(screen.getByLabelText("会话标题"), "新的标题");
    await user.click(screen.getByRole("button", { name: "保存标题" }));

    expect((await screen.findAllByText("新的标题")).length).toBeGreaterThan(0);
    expect(screen.queryByText("旧标题")).not.toBeInTheDocument();
    expect(chatListRequestCount).toBe(2);

    const chatButtons = screen
      .getAllByRole("button")
      .filter(
        (button) =>
          button.textContent?.includes("新的标题") ||
          button.textContent?.includes("另一个会话"),
      );

    expect(
      chatButtons.map((button) =>
        button.textContent?.includes("新的标题") ? "新的标题" : "另一个会话",
      ),
    ).toEqual([
      "新的标题",
      "另一个会话",
    ]);
  });
});
