import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
const openAIConstructor = vi.fn(function OpenAIClient() {
  return {
    chat: {
      completions: {
        create: createMock,
      },
    },
  };
});

vi.mock("openai", () => ({
  default: openAIConstructor,
}));

async function importChatModule() {
  vi.resetModules();
  return import("@/lib/chat");
}

describe("streamAssistantReply", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.SILICONFLOW_API_KEY;
    delete process.env.SILICONFLOW_BASE_URL;
    delete process.env.SILICONFLOW_MODEL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws when SILICONFLOW_API_KEY is missing", async () => {
    const { streamAssistantReply } = await importChatModule();

    await expect(
      streamAssistantReply([{ role: "user", content: "你好" }]),
    ).rejects.toThrow("SILICONFLOW_API_KEY is not configured");
  });

  it("uses SiliconFlow's OpenAI-compatible streaming client", async () => {
    createMock.mockResolvedValue((async function* () {
      yield {
        choices: [{ delta: { content: "你好" } }],
      };
      yield {
        choices: [{ delta: { content: "，全栈同学。" } }],
      };
    })());

    process.env.SILICONFLOW_API_KEY = "test-key";
    process.env.SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
    process.env.SILICONFLOW_MODEL = "Qwen/Qwen2.5-7B-Instruct";

    const { streamAssistantReply } = await importChatModule();
    const chunks: string[] = [];

    for await (const chunk of await streamAssistantReply([
      { role: "user", content: "介绍下你自己" },
    ])) {
      chunks.push(chunk);
    }

    expect(openAIConstructor).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://api.siliconflow.cn/v1",
    });
    expect(createMock).toHaveBeenCalledWith({
      model: "Qwen/Qwen2.5-7B-Instruct",
      messages: [
        expect.objectContaining({
          role: "system",
        }),
        {
          role: "user",
          content: "介绍下你自己",
        },
      ],
      stream: true,
      temperature: 0.6,
    });
    expect(chunks.join("")).toBe("你好，全栈同学。");
  });
});
