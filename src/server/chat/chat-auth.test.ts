import { describe, expect, it } from "vitest";

import {
  assertChatOwner,
  requireAuthenticatedUser,
  requireVerifiedUser,
  ForbiddenError,
} from "@/server/chat/chat-auth";

describe("chat-auth", () => {
  it("throws when no authenticated user is present", () => {
    expect(() => requireAuthenticatedUser(null)).toThrowError(
      "登录状态已失效，请重新登录。",
    );
  });

  it("returns the authenticated user when present", () => {
    const user = {
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: new Date("2026-04-09T01:00:00.000Z"),
    };

    expect(requireAuthenticatedUser(user)).toBe(user);
  });

  it("blocks authenticated users whose email is still unverified", () => {
    expect(() =>
      requireVerifiedUser({
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: null,
      }),
    ).toThrowError("请先验证邮箱后再继续聊天。");
  });

  it("returns the verified user when email verification is complete", () => {
    const user = {
      id: "user_1",
      email: "alice@example.com",
      emailVerifiedAt: new Date("2026-04-09T01:00:00.000Z"),
    };

    expect(requireVerifiedUser(user)).toBe(user);
  });

  it("rejects access to chats owned by another user", () => {
    expect(() =>
      assertChatOwner(
        {
          id: "chat_1",
          title: "测试会话",
          userId: "user_2",
          guestSessionId: null,
        },
        { kind: "user", userId: "user_1" },
      ),
    ).toThrow(ForbiddenError);
  });

  it("allows access when the chat belongs to the current user", () => {
    expect(() =>
      assertChatOwner(
        {
          id: "chat_1",
          title: "测试会话",
          userId: "user_1",
          guestSessionId: null,
        },
        { kind: "user", userId: "user_1" },
      ),
    ).not.toThrow();
  });

  it("rejects guest access to chats from another guest session", () => {
    expect(() =>
      assertChatOwner(
        {
          id: "chat_1",
          title: "测试会话",
          userId: null,
          guestSessionId: "guest_2",
        },
        { kind: "guest", guestSessionId: "guest_1" },
      ),
    ).toThrow(ForbiddenError);
  });

  it("allows access when the chat belongs to the current guest session", () => {
    expect(() =>
      assertChatOwner(
        {
          id: "chat_1",
          title: "测试会话",
          userId: null,
          guestSessionId: "guest_1",
        },
        { kind: "guest", guestSessionId: "guest_1" },
      ),
    ).not.toThrow();
  });
});
