import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  createMessage: vi.fn(),
}));

vi.mock("@/server/chat/chat-repository", () => repository);

import { createStreamingChatResponse } from "@/server/chat/chat-stream";

describe("chat-stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams text to the client and persists the completed assistant reply", async () => {
    const response = createStreamingChatResponse({
      chatId: "chat_1",
      replyStream: (async function* () {
        yield "第一段";
        yield "第二段";
      })(),
      startedAt: Date.now(),
    });

    expect(await response.text()).toBe("第一段第二段");
    expect(response.headers.get("X-Chat-Id")).toBe("chat_1");
    expect(repository.createMessage).toHaveBeenCalledWith({
      chatId: "chat_1",
      role: "assistant",
      content: "第一段第二段",
    });
  });
});
