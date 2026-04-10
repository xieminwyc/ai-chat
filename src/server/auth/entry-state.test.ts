import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
}));

const guestService = vi.hoisted(() => ({
  getCurrentGuestSession: vi.fn(),
  getMergeableGuestSession: vi.fn(),
}));

vi.mock("@/server/auth/auth-service", () => authService);
vi.mock("@/server/guest/guest-service", () => guestService);

import type { EntryState } from "@/server/auth/entry-state";
import {
  resolveEntryStateFromCookieHeader,
  resolveEntryStateFromCookieStore,
  resolveProtectedPageAccess,
} from "@/server/auth/entry-state";

function createCookieStore(
  values: Record<string, string | undefined>,
): { get: (name: string) => { name: string; value: string } | undefined } {
  return {
    get(name: string) {
      const value = values[name];
      return value === undefined ? undefined : { name, value };
    },
  };
}

describe("entry-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authService.getCurrentSession.mockResolvedValue(null);
    guestService.getCurrentGuestSession.mockResolvedValue(null);
    guestService.getMergeableGuestSession.mockResolvedValue(null);
  });

  it("resolves authenticated_verified with mergeCandidate when a verified session and mergeable guest token coexist", async () => {
    authService.getCurrentSession.mockResolvedValue({
      id: "session_1",
      token: "session-token",
      userId: "user_1",
      expiresAt: new Date("2026-04-15T01:00:00.000Z"),
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: new Date("2026-04-08T03:00:00.000Z"),
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      },
    });
    guestService.getMergeableGuestSession.mockResolvedValue({
      id: "guest_1",
      guestToken: "guest-token",
      trialMessageCount: 2,
      mergedAt: null,
      expiresAt: new Date("2026-04-22T01:00:00.000Z"),
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      updatedAt: new Date("2026-04-08T01:00:00.000Z"),
    });

    const state = await resolveEntryStateFromCookieHeader(
      "ai-chat-session=session-token; ai-chat-guest=guest-token",
    );

    expect(state.kind).toBe("authenticated_verified");
    expect(state.mergeCandidate).toEqual({
      guestSessionId: "guest_1",
      trialMessageCount: 2,
    });
  });

  it("resolves authenticated_unverified without mergeCandidate", async () => {
    authService.getCurrentSession.mockResolvedValue({
      id: "session_1",
      token: "session-token",
      userId: "user_1",
      expiresAt: new Date("2026-04-15T01:00:00.000Z"),
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: null,
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      },
    });

    const state = await resolveEntryStateFromCookieHeader(
      "ai-chat-session=session-token; ai-chat-guest=guest-token",
    );

    expect(state.kind).toBe("authenticated_unverified");
    expect(state.mergeCandidate).toBeNull();
    expect(guestService.getMergeableGuestSession).not.toHaveBeenCalled();
  });

  it("resolves signed_out_auth_shell when no session exists and auth-shell cookie is present", async () => {
    const state = await resolveEntryStateFromCookieStore(
      createCookieStore({
        "ai-chat-auth-shell": "1",
      }) as never,
    );

    expect(state.kind).toBe("signed_out_auth_shell");
  });

  it("resolves signed_out_guest_workspace when a current guest session exists", async () => {
    guestService.getCurrentGuestSession.mockResolvedValue({
      id: "guest_1",
      guestToken: "guest-token",
      trialMessageCount: 1,
      mergedAt: null,
      expiresAt: new Date("2026-04-22T01:00:00.000Z"),
      createdAt: new Date("2026-04-08T01:00:00.000Z"),
      updatedAt: new Date("2026-04-08T01:00:00.000Z"),
    });

    const state = await resolveEntryStateFromCookieHeader(
      "ai-chat-guest=guest-token",
    );

    expect(state.kind).toBe("signed_out_guest_workspace");
    expect(state.guestSession).toEqual({
      id: "guest_1",
      trialMessageCount: 1,
    });
  });

  it("resolves signed_out_guest_preview when no valid guest session exists", async () => {
    guestService.getCurrentGuestSession.mockResolvedValue(null);

    const state = await resolveEntryStateFromCookieHeader(
      "ai-chat-guest=stale-guest-token",
    );

    expect(state.kind).toBe("signed_out_guest_preview");
  });

  it("access helper allows authenticated pages only for authenticated states", () => {
    const cases: Array<{ state: EntryState; allowed: boolean }> = [
      {
        state: { kind: "signed_out_guest_preview" },
        allowed: false,
      },
      {
        state: {
          kind: "signed_out_guest_workspace",
          guestSession: { id: "guest_1", trialMessageCount: 1 },
        },
        allowed: false,
      },
      {
        state: { kind: "signed_out_auth_shell" },
        allowed: false,
      },
      {
        state: {
          kind: "authenticated_unverified",
          user: {
            id: "user_1",
            email: "alice@example.com",
            emailVerifiedAt: null,
            createdAt: new Date("2026-04-08T01:00:00.000Z"),
            updatedAt: new Date("2026-04-08T01:00:00.000Z"),
          },
          mergeCandidate: null,
        },
        allowed: true,
      },
      {
        state: {
          kind: "authenticated_verified",
          user: {
            id: "user_1",
            email: "alice@example.com",
            emailVerifiedAt: new Date("2026-04-08T03:00:00.000Z"),
            createdAt: new Date("2026-04-08T01:00:00.000Z"),
            updatedAt: new Date("2026-04-08T01:00:00.000Z"),
          },
          mergeCandidate: {
            guestSessionId: "guest_1",
            trialMessageCount: 2,
          },
        },
        allowed: true,
      },
    ];

    for (const { state, allowed } of cases) {
      expect(resolveProtectedPageAccess(state, "authenticated")).toEqual({
        allowed,
        redirectTo: allowed ? null : "/",
      });
    }
  });

  it("access helper allows verified pages only for authenticated_verified", () => {
    const unverifiedState: EntryState = {
      kind: "authenticated_unverified",
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: null,
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      },
      mergeCandidate: null,
    };
    const verifiedState: EntryState = {
      kind: "authenticated_verified",
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: new Date("2026-04-08T03:00:00.000Z"),
        createdAt: new Date("2026-04-08T01:00:00.000Z"),
        updatedAt: new Date("2026-04-08T01:00:00.000Z"),
      },
      mergeCandidate: null,
    };

    expect(resolveProtectedPageAccess(unverifiedState, "verified")).toEqual({
      allowed: false,
      redirectTo: "/",
    });
    expect(resolveProtectedPageAccess(verifiedState, "verified")).toEqual({
      allowed: true,
      redirectTo: null,
    });
  });
});
