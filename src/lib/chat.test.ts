import { describe, expect, it } from "vitest";

import { createAssistantReply } from "@/lib/chat";

describe("createAssistantReply", () => {
  it("returns a greeting when the user says hello", () => {
    expect(createAssistantReply("你好")).toContain("你好");
    expect(createAssistantReply("你好")).toContain("前端/全栈学习助手");
  });

  it("returns Next.js guidance for related questions", () => {
    expect(createAssistantReply("我想学 next.js")).toContain("Next.js");
    expect(createAssistantReply("我想学 next.js")).toContain("路由");
  });

  it("returns a compact title for the first user message", () => {
    expect(createAssistantReply("请你系统讲一下 next.js 和 react 的关系", { mode: "title" })).toBe(
      "Next.js 和 React"
    );
  });

  it("falls back to a study-oriented generic reply", () => {
    expect(createAssistantReply("今天学什么")).toContain("学习助手");
    expect(createAssistantReply("今天学什么")).toContain("Next.js");
  });
});
