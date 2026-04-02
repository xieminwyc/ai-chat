import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  deleteChatById: vi.fn(),
  listChatSummaries: vi.fn(),
  loadChatMessages: vi.fn(),
  prepareChatReply: vi.fn(),
  renameChat: vi.fn(),
}));

const stream = vi.hoisted(() => ({
  createStreamingChatResponse: vi.fn(),
}));

vi.mock("@/server/chat/chat-service", () => service);
vi.mock("@/server/chat/chat-stream", () => stream);

import { DELETE, GET, PATCH, POST } from "@/app/api/chat/route";

describe("/api/chat route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads chat list through the chat service", async () => {
    service.listChatSummaries.mockResolvedValue([
      {
        id: "chat_2",
        title: "较新的会话",
        createdAt: new Date("2026-03-24T11:20:51.259Z"),
        updatedAt: new Date("2026-03-25T10:07:23.524Z"),
      },
    ]);

    const response = await GET(new Request("http://localhost:3000/api/chat"));
    const data = await response.json();

    expect(service.listChatSummaries).toHaveBeenCalledTimes(1);
    expect(data.chats[0]).toMatchObject({
      createdAt: "2026-03-24T11:20:51.259Z",
      updatedAt: "2026-03-25T10:07:23.524Z",
    });
  });

  it("returns message timestamps from the service layer", async () => {
    service.loadChatMessages.mockResolvedValue([
      {
        id: "message_1",
        role: "user",
        content: "介绍下你自己",
        createdAt: new Date("2026-03-24T11:20:51.268Z"),
      },
    ]);

    const response = await GET(
      new Request("http://localhost:3000/api/chat?chatId=chat_1"),
    );
    const data = await response.json();

    expect(service.loadChatMessages).toHaveBeenCalledWith("chat_1");
    expect(data.messages[0]).toMatchObject({
      createdAt: "2026-03-24T11:20:51.268Z",
    });
  });

  it("renames a chat title through the service", async () => {
    service.renameChat.mockResolvedValue({
      id: "chat_1",
      title: "新的标题",
      updatedAt: new Date("2026-03-25T10:07:23.524Z"),
    });

    const response = await PATCH(
      new Request("http://localhost:3000/api/chat?chatId=chat_1", {
        method: "PATCH",
        body: JSON.stringify({ title: "新的标题" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const data = await response.json();

    expect(service.renameChat).toHaveBeenCalledWith("chat_1", "新的标题");
    expect(data.chat.updatedAt).toBe("2026-03-25T10:07:23.524Z");
  });

  it("deletes a chat through the service", async () => {
    const response = await DELETE(
      new Request("http://localhost:3000/api/chat?chatId=chat_1", {
        method: "DELETE",
      }),
    );
    const data = await response.json();

    expect(service.deleteChatById).toHaveBeenCalledWith("chat_1");
    expect(data.success).toBe(true);
  });

  it("creates a streaming response after preparing a reply", async () => {
    const streamingResponse = new Response("第一段第二段", {
      headers: {
        "X-Chat-Id": "chat_1",
      },
    });

    service.prepareChatReply.mockResolvedValue({
      chatId: "chat_1",
      isNewChat: false,
      replyStream: (async function* () {
        yield "第一段";
        yield "第二段";
      })(),
    });
    stream.createStreamingChatResponse.mockReturnValue(streamingResponse);

    const response = await POST(
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        body: JSON.stringify({
          chatId: "chat_1",
          message: "继续学习数据库",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(service.prepareChatReply).toHaveBeenCalledWith({
      chatId: "chat_1",
      message: "继续学习数据库",
    });
    expect(stream.createStreamingChatResponse).toHaveBeenCalledWith({
      chatId: "chat_1",
      replyStream: expect.any(Object),
      startedAt: expect.any(Number),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("第一段第二段");
  });
});
