import { afterEach, describe, expect, it } from "vitest";

import {
  getSessionCookieName,
  getSessionCookieOptions,
  readSessionTokenFromCookieHeader,
} from "@/server/auth/session";

describe("auth session helpers", () => {
  const originalCookieSecure = process.env.COOKIE_SECURE;
  const originalAppUrl = process.env.APP_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalCookieSecure === undefined) {
      delete process.env.COOKIE_SECURE;
    } else {
      process.env.COOKIE_SECURE = originalCookieSecure;
    }

    if (originalAppUrl === undefined) {
      delete process.env.APP_URL;
    } else {
      process.env.APP_URL = originalAppUrl;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("returns the session cookie name", () => {
    expect(getSessionCookieName()).toBe("ai-chat-session");
  });

  it("returns non-secure session cookie options when APP_URL is http", () => {
    process.env.APP_URL = "http://xieminstudio.xyz:3000";
    process.env.NODE_ENV = "production";
    delete process.env.COOKIE_SECURE;

    expect(getSessionCookieOptions()).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });
  });

  it("lets COOKIE_SECURE override APP_URL", () => {
    process.env.APP_URL = "http://xieminstudio.xyz:3000";
    process.env.COOKIE_SECURE = "true";

    expect(getSessionCookieOptions().secure).toBe(true);

    process.env.COOKIE_SECURE = "false";

    expect(getSessionCookieOptions().secure).toBe(false);
  });

  it("reads the session token from the cookie header", () => {
    expect(
      readSessionTokenFromCookieHeader(
        "foo=bar; ai-chat-session=session-token; x=y",
      ),
    ).toBe("session-token");
    expect(readSessionTokenFromCookieHeader("foo=bar")).toBeNull();
    expect(readSessionTokenFromCookieHeader()).toBeNull();
  });
});
