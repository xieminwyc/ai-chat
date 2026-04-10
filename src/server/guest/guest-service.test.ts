import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  createGuestSession: vi.fn(),
  findGuestSessionById: vi.fn(),
  findGuestSessionByToken: vi.fn(),
  incrementGuestTrialCount: vi.fn(),
  mergeGuestSessionIntoUser: vi.fn(),
}));

vi.mock("@/server/guest/guest-repository", () => repository);

import {
  assertGuestMessageQuotaAvailable,
  consumeGuestMessageQuota,
  getCurrentGuestSession,
  getMergeableGuestSession,
  getOrCreateGuestSession,
  GUEST_MESSAGE_LIMIT,
  mergeGuestSessionIntoUserAccount,
} from "@/server/guest/guest-service";
import {
  createGuestToken,
  getGuestAuthShellCookieOptions,
  getGuestCookieName,
  getGuestCookieOptions,
  getGuestExpiresAt,
  readGuestTokenFromCookieHeader,
} from "@/server/guest/guest-session";

function createGuestSessionRecord(overrides?: {
  id?: string;
  guestToken?: string;
  trialMessageCount?: number;
  expiresAt?: Date;
  mergedAt?: Date | null;
}) {
  return {
    id: overrides?.id ?? "guest_1",
    guestToken: overrides?.guestToken ?? "guest-token",
    trialMessageCount: overrides?.trialMessageCount ?? 0,
    mergedAt: overrides?.mergedAt ?? null,
    expiresAt: overrides?.expiresAt ?? new Date("2026-04-22T00:00:00.000Z"),
    createdAt: new Date("2026-04-08T00:00:00.000Z"),
    updatedAt: new Date("2026-04-08T00:00:00.000Z"),
  };
}

describe("guest-session helpers", () => {
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

  it("creates a random guest token", () => {
    expect(createGuestToken()).toEqual(expect.any(String));
    expect(createGuestToken().length).toBeGreaterThan(0);
  });

  it("returns the guest cookie name", () => {
    expect(getGuestCookieName()).toBe("ai-chat-guest");
  });

  it("returns a 14-day guest expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00.000Z"));

    expect(getGuestExpiresAt().toISOString()).toBe("2026-04-22T00:00:00.000Z");

    vi.useRealTimers();
  });

  it("returns non-secure guest cookie options when APP_URL is http", () => {
    process.env.APP_URL = "http://xieminstudio.xyz:3000";
    process.env.NODE_ENV = "production";
    delete process.env.COOKIE_SECURE;

    expect(getGuestCookieOptions()).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 14 * 24 * 60 * 60,
    });
    expect(getGuestAuthShellCookieOptions()).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 14 * 24 * 60 * 60,
    });
  });

  it("lets COOKIE_SECURE override APP_URL", () => {
    process.env.APP_URL = "http://xieminstudio.xyz:3000";
    process.env.COOKIE_SECURE = "true";

    expect(getGuestCookieOptions().secure).toBe(true);
    expect(getGuestAuthShellCookieOptions().secure).toBe(true);

    process.env.COOKIE_SECURE = "false";

    expect(getGuestCookieOptions().secure).toBe(false);
    expect(getGuestAuthShellCookieOptions().secure).toBe(false);
  });

  it("reads guest token from cookie header", () => {
    expect(
      readGuestTokenFromCookieHeader("foo=bar; ai-chat-guest=guest-token; x=y"),
    ).toBe("guest-token");
    expect(readGuestTokenFromCookieHeader("foo=bar")).toBeNull();
    expect(readGuestTokenFromCookieHeader()).toBeNull();
  });
});

describe("guest-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the shared guest message limit", () => {
    expect(GUEST_MESSAGE_LIMIT).toBe(3);
  });

  it("creates a guest session when no guest cookie is present", async () => {
    const createdSession = createGuestSessionRecord();
    repository.createGuestSession.mockResolvedValue(createdSession);

    const result = await getOrCreateGuestSession(undefined);

    expect(repository.findGuestSessionByToken).not.toHaveBeenCalled();
    expect(repository.createGuestSession).toHaveBeenCalledWith({
      guestToken: expect.any(String),
      expiresAt: expect.any(Date),
    });
    expect(repository.incrementGuestTrialCount).not.toHaveBeenCalled();
    expect(result).toEqual({
      guestSession: createdSession,
      created: true,
    });
  });

  it("returns the existing guest session when token is valid", async () => {
    const existingSession = createGuestSessionRecord({
      expiresAt: new Date("2026-04-22T00:00:00.000Z"),
    });
    repository.findGuestSessionByToken.mockResolvedValue(existingSession);

    const result = await getOrCreateGuestSession("guest-token");

    expect(repository.findGuestSessionByToken).toHaveBeenCalledWith("guest-token");
    expect(repository.createGuestSession).not.toHaveBeenCalled();
    expect(result).toEqual({
      guestSession: existingSession,
      created: false,
    });
  });

  it("recreates a guest session when the token is expired", async () => {
    const expiredSession = createGuestSessionRecord({
      expiresAt: new Date("2026-04-07T23:59:59.000Z"),
    });
    const newSession = createGuestSessionRecord({
      id: "guest_2",
      guestToken: "new-guest-token",
      expiresAt: new Date("2026-04-22T00:00:00.000Z"),
    });
    repository.findGuestSessionByToken.mockResolvedValue(expiredSession);
    repository.createGuestSession.mockResolvedValue(newSession);

    const result = await getOrCreateGuestSession("expired-token");

    expect(repository.findGuestSessionByToken).toHaveBeenCalledWith("expired-token");
    expect(repository.createGuestSession).toHaveBeenCalledWith({
      guestToken: expect.any(String),
      expiresAt: expect.any(Date),
    });
    expect(result).toEqual({
      guestSession: newSession,
      created: true,
    });
  });

  it("returns null for expired guest session", async () => {
    repository.findGuestSessionByToken.mockResolvedValue(
      createGuestSessionRecord({
        expiresAt: new Date("2026-04-07T23:59:59.000Z"),
      }),
    );

    await expect(getCurrentGuestSession("expired-token")).resolves.toBeNull();
  });

  it("returns null for a merged guest session", async () => {
    repository.findGuestSessionByToken.mockResolvedValue(
      createGuestSessionRecord({
        mergedAt: new Date("2026-04-08T00:05:00.000Z"),
      }),
    );

    await expect(getCurrentGuestSession("merged-token")).resolves.toBeNull();
  });

  it("detects a mergeable guest session from a valid guest token", async () => {
    const session = createGuestSessionRecord();
    repository.findGuestSessionByToken.mockResolvedValue(session);

    await expect(getMergeableGuestSession("guest-token")).resolves.toEqual(session);
  });

  it("returns null when there is no mergeable guest token", async () => {
    await expect(getMergeableGuestSession(undefined)).resolves.toBeNull();
    expect(repository.findGuestSessionByToken).not.toHaveBeenCalled();
  });

  it("merges guest chats into a verified user account", async () => {
    const mergedAt = new Date("2026-04-08T00:10:00.000Z");
    vi.setSystemTime(mergedAt);
    repository.findGuestSessionById.mockResolvedValue(createGuestSessionRecord());
    repository.mergeGuestSessionIntoUser.mockResolvedValue({
      mergedGuestSession: createGuestSessionRecord({
        mergedAt,
      }),
      mergedChatCount: 2,
    });

    const result = await mergeGuestSessionIntoUserAccount({
      guestSessionId: "guest_1",
      userId: "user_1",
    });

    expect(repository.mergeGuestSessionIntoUser).toHaveBeenCalledWith({
      guestSessionId: "guest_1",
      userId: "user_1",
      mergedAt,
    });
    expect(result.mergedChatCount).toBe(2);
  });

  it("rejects merge for a merged guest session", async () => {
    repository.findGuestSessionById.mockResolvedValue(
      createGuestSessionRecord({
        mergedAt: new Date("2026-04-08T00:05:00.000Z"),
      }),
    );

    await expect(
      mergeGuestSessionIntoUserAccount({
        guestSessionId: "guest_1",
        userId: "user_1",
      }),
    ).rejects.toThrow("Guest session has already been merged.");
  });

  it("increments guest trial count after a successful guest message", async () => {
    repository.findGuestSessionById.mockResolvedValue(
      createGuestSessionRecord(),
    );
    const updatedSession = createGuestSessionRecord({
      trialMessageCount: 1,
      updatedAt: new Date("2026-04-08T00:01:00.000Z"),
    });
    repository.incrementGuestTrialCount.mockResolvedValue(updatedSession);

    const result = await consumeGuestMessageQuota("guest_1");

    expect(repository.incrementGuestTrialCount).toHaveBeenCalledWith(
      "guest_1",
      GUEST_MESSAGE_LIMIT,
    );
    expect(result).toEqual(updatedSession);
  });

  it("rejects guest messages once the trial limit is exhausted", async () => {
    repository.findGuestSessionById.mockResolvedValue(
      createGuestSessionRecord({
        trialMessageCount: GUEST_MESSAGE_LIMIT,
      }),
    );
    repository.incrementGuestTrialCount.mockResolvedValue(null);

    await expect(consumeGuestMessageQuota("guest_1")).rejects.toThrow(
      "Guest trial limit reached. Please register to continue.",
    );
  });

  it("treats an expired guest session as expired rather than exhausted", async () => {
    repository.findGuestSessionById.mockResolvedValue(
      createGuestSessionRecord({
        expiresAt: new Date("2026-04-07T23:59:59.000Z"),
      }),
    );

    await expect(consumeGuestMessageQuota("guest_1")).rejects.toThrow(
      "Guest session expired. Please refresh to continue.",
    );
    expect(repository.incrementGuestTrialCount).not.toHaveBeenCalled();
  });

  it("checks guest quota availability without consuming it", async () => {
    const session = createGuestSessionRecord({
      trialMessageCount: GUEST_MESSAGE_LIMIT - 1,
    });
    repository.findGuestSessionById.mockResolvedValue(session);

    await expect(assertGuestMessageQuotaAvailable("guest_1")).resolves.toEqual(
      session,
    );
    expect(repository.incrementGuestTrialCount).not.toHaveBeenCalled();
  });

  it("treats an unknown guest session as missing", async () => {
    repository.findGuestSessionById.mockResolvedValue(null);

    await expect(consumeGuestMessageQuota("guest_missing")).rejects.toThrow(
      "Guest session not found.",
    );
    expect(repository.incrementGuestTrialCount).not.toHaveBeenCalled();
  });

  it("treats a merged guest session as unavailable for quota use", async () => {
    repository.findGuestSessionById.mockResolvedValue(
      createGuestSessionRecord({
        mergedAt: new Date("2026-04-08T00:05:00.000Z"),
      }),
    );

    await expect(consumeGuestMessageQuota("guest_1")).rejects.toThrow(
      "Guest session has already been merged.",
    );
    expect(repository.incrementGuestTrialCount).not.toHaveBeenCalled();
  });
});
