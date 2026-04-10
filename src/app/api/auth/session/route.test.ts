import { beforeEach, describe, expect, it, vi } from "vitest";

const entryState = vi.hoisted(() => ({
  resolveEntryStateFromCookieHeader: vi.fn(),
}));

const guestService = vi.hoisted(() => ({
  GUEST_MESSAGE_LIMIT: 3,
  getOrCreateGuestSession: vi.fn(),
}));

const guestSession = vi.hoisted(() => ({
  getGuestCookieName: vi.fn(),
  getGuestCookieOptions: vi.fn(),
  readGuestTokenFromCookieHeader: vi.fn(),
}));

vi.mock("@/server/auth/entry-state", () => entryState);
vi.mock("@/server/guest/guest-service", () => guestService);
vi.mock("@/server/guest/guest-session", () => guestSession);

import { GET } from "@/app/api/auth/session/route";

describe("/api/auth/session route", () => {
  const verifiedUser = {
    id: "user_1",
    email: "alice@example.com",
    emailVerifiedAt: new Date("2026-04-08T03:00:00.000Z"),
    createdAt: new Date("2026-04-08T01:00:00.000Z"),
    updatedAt: new Date("2026-04-08T01:00:00.000Z"),
  };

  const unverifiedUser = {
    ...verifiedUser,
    emailVerifiedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    entryState.resolveEntryStateFromCookieHeader.mockResolvedValue({
      kind: "signed_out_guest_preview",
    });
    guestSession.getGuestCookieName.mockReturnValue("ai-chat-guest");
    guestSession.getGuestCookieOptions.mockReturnValue({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 14 * 24 * 60 * 60,
    });
    guestSession.readGuestTokenFromCookieHeader.mockReturnValue(null);
    guestService.getOrCreateGuestSession.mockResolvedValue({
      guestSession: {
        id: "guest_1",
        guestToken: "guest-token",
        trialMessageCount: 0,
        expiresAt: new Date("2026-04-24T01:00:00.000Z"),
      },
      created: true,
    });
  });

  it("returns authenticated verified payload with user and optional mergeCandidate", async () => {
    entryState.resolveEntryStateFromCookieHeader.mockResolvedValue({
      kind: "authenticated_verified",
      user: verifiedUser,
      mergeCandidate: {
        guestSessionId: "guest_1",
        trialMessageCount: 2,
      },
    });

    const response = await GET(
      new Request("http://localhost:3000/api/auth/session", {
        headers: {
          cookie: "ai-chat-session=session-token; ai-chat-guest=guest-token",
        },
      }),
    );

    const data = await response.json();

    expect(entryState.resolveEntryStateFromCookieHeader).toHaveBeenCalledWith(
      "ai-chat-session=session-token; ai-chat-guest=guest-token",
    );
    expect(guestService.getOrCreateGuestSession).not.toHaveBeenCalled();
    expect(data).toMatchObject({
      authenticated: true,
      user: {
        isEmailVerified: true,
      },
      mergeCandidate: {
        guestSessionId: "guest_1",
        trialMessageCount: 2,
      },
      guest: null,
    });
    expect(data.user).toMatchObject({
      id: verifiedUser.id,
      email: verifiedUser.email,
    });
  });

  it("returns authenticated unverified payload with user and no mergeCandidate", async () => {
    entryState.resolveEntryStateFromCookieHeader.mockResolvedValue({
      kind: "authenticated_unverified",
      user: unverifiedUser,
      mergeCandidate: null,
    });

    const response = await GET(new Request("http://localhost:3000/api/auth/session"));
    const data = await response.json();

    expect(guestService.getOrCreateGuestSession).not.toHaveBeenCalled();
    expect(data).toMatchObject({
      authenticated: true,
      user: {
        id: unverifiedUser.id,
        email: unverifiedUser.email,
        isEmailVerified: false,
      },
      mergeCandidate: null,
      guest: null,
    });
  });

  it("returns signed-out auth shell payload and does not create a guest session", async () => {
    entryState.resolveEntryStateFromCookieHeader.mockResolvedValue({
      kind: "signed_out_auth_shell",
    });

    const response = await GET(
      new Request("http://localhost:3000/api/auth/session", {
        headers: {
          cookie: "ai-chat-auth-shell=1; ai-chat-guest=guest-token",
        },
      }),
    );
    const data = await response.json();

    expect(data).toEqual({
      authenticated: false,
      user: null,
      guest: null,
    });
    expect(entryState.resolveEntryStateFromCookieHeader).toHaveBeenCalledWith(
      "ai-chat-auth-shell=1; ai-chat-guest=guest-token",
    );
    expect(guestService.getOrCreateGuestSession).not.toHaveBeenCalled();
  });

  it("returns signed-out guest workspace payload without creating a new guest session", async () => {
    entryState.resolveEntryStateFromCookieHeader.mockResolvedValue({
      kind: "signed_out_guest_workspace",
      guestSession: {
        id: "guest_1",
        trialMessageCount: 2,
      },
    });

    const response = await GET(new Request("http://localhost:3000/api/auth/session"));
    const data = await response.json();

    expect(guestService.getOrCreateGuestSession).not.toHaveBeenCalled();
    expect(data).toEqual({
      authenticated: false,
      user: null,
      guest: {
        active: true,
        trialMessageCount: 2,
        messageLimit: 3,
      },
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns signed-out guest preview payload, creates a guest session, and writes the guest cookie", async () => {
    entryState.resolveEntryStateFromCookieHeader.mockResolvedValue({
      kind: "signed_out_guest_preview",
    });
    guestSession.readGuestTokenFromCookieHeader.mockReturnValue(null);
    guestService.getOrCreateGuestSession.mockResolvedValue({
      guestSession: {
        id: "guest_1",
        guestToken: "guest-token",
        trialMessageCount: 1,
        expiresAt: new Date("2026-04-24T01:00:00.000Z"),
      },
      created: true,
    });

    const response = await GET(new Request("http://localhost:3000/api/auth/session"));
    const data = await response.json();

    expect(data).toEqual({
      authenticated: false,
      user: null,
      guest: {
        active: true,
        trialMessageCount: 1,
        messageLimit: 3,
      },
    });
    expect(guestService.getOrCreateGuestSession).toHaveBeenCalledWith(null);
    expect(response.headers.get("set-cookie")).toContain("ai-chat-guest=guest-token");
  });

  it("forwards stale guest token for preview activation and replaces the guest cookie", async () => {
    entryState.resolveEntryStateFromCookieHeader.mockResolvedValue({
      kind: "signed_out_guest_preview",
    });
    guestSession.readGuestTokenFromCookieHeader.mockReturnValue("stale-token");
    guestService.getOrCreateGuestSession.mockResolvedValue({
      guestSession: {
        id: "guest_2",
        guestToken: "fresh-token",
        trialMessageCount: 0,
        expiresAt: new Date("2026-04-25T01:00:00.000Z"),
      },
      created: true,
    });

    const response = await GET(
      new Request("http://localhost:3000/api/auth/session", {
        headers: {
          cookie: "ai-chat-guest=stale-token",
        },
      }),
    );

    expect(guestService.getOrCreateGuestSession).toHaveBeenCalledWith("stale-token");
    expect(response.headers.get("set-cookie")).toContain("ai-chat-guest=fresh-token");
  });

  it("throws for an unknown entry state instead of implicitly creating a guest session", async () => {
    entryState.resolveEntryStateFromCookieHeader.mockResolvedValue({
      kind: "future_state",
    } as never);

    await expect(
      GET(new Request("http://localhost:3000/api/auth/session")),
    ).rejects.toThrow("Unhandled entry state");

    expect(guestService.getOrCreateGuestSession).not.toHaveBeenCalled();
  });
});
