import { getCurrentSession } from "@/server/auth/auth-service";
import {
  getSessionCookieName,
  readSessionTokenFromCookieHeader,
} from "@/server/auth/session";
import {
  getCurrentGuestSession,
  getMergeableGuestSession,
} from "@/server/guest/guest-service";
import {
  getGuestAuthShellCookieName,
  getGuestCookieName,
  readGuestAuthShellFromCookieHeader,
  readGuestTokenFromCookieHeader,
} from "@/server/guest/guest-session";

export type EntryStateKind =
  | "signed_out_guest_preview"
  | "signed_out_guest_workspace"
  | "signed_out_auth_shell"
  | "authenticated_unverified"
  | "authenticated_verified";

export type EntryState = Readonly<
  | {
      kind: "signed_out_guest_preview";
    }
  | {
      kind: "signed_out_guest_workspace";
      guestSession: {
        id: string;
        trialMessageCount: number;
      };
    }
  | {
      kind: "signed_out_auth_shell";
    }
  | {
      kind: "authenticated_unverified";
      user: Awaited<ReturnType<typeof getCurrentSession>> extends infer T
        ? T extends { user: infer U }
          ? U
          : never
        : never;
      mergeCandidate: null;
    }
  | {
      kind: "authenticated_verified";
      user: Awaited<ReturnType<typeof getCurrentSession>> extends infer T
        ? T extends { user: infer U }
          ? U
          : never
        : never;
      mergeCandidate: {
        guestSessionId: string;
        trialMessageCount: number;
      } | null;
    }
>;

type EntryIdentityInput = {
  sessionToken?: string | null;
  guestToken?: string | null;
  shouldPreferAuthShell?: boolean;
};

async function resolveEntryStateFromIdentity({
  sessionToken,
  guestToken,
  shouldPreferAuthShell = false,
}: EntryIdentityInput): Promise<EntryState> {
  const session = await getCurrentSession(sessionToken);

  if (session) {
    if (!session.user.emailVerifiedAt) {
      return {
        kind: "authenticated_unverified",
        user: session.user,
        mergeCandidate: null,
      };
    }

    const mergeableGuestSession = await getMergeableGuestSession(guestToken);
    return {
      kind: "authenticated_verified",
      user: session.user,
      mergeCandidate: mergeableGuestSession
        ? {
            guestSessionId: mergeableGuestSession.id,
            trialMessageCount: mergeableGuestSession.trialMessageCount,
          }
        : null,
    };
  }

  if (shouldPreferAuthShell) {
    return { kind: "signed_out_auth_shell" };
  }

  const guestSession = await getCurrentGuestSession(guestToken);
  if (!guestSession) {
    return { kind: "signed_out_guest_preview" };
  }

  return {
    kind: "signed_out_guest_workspace",
    guestSession: {
      id: guestSession.id,
      trialMessageCount: guestSession.trialMessageCount,
    },
  };
}

export async function resolveEntryStateFromCookieHeader(
  cookieHeader?: string | null,
): Promise<EntryState> {
  return resolveEntryStateFromIdentity({
    sessionToken: readSessionTokenFromCookieHeader(cookieHeader),
    guestToken: readGuestTokenFromCookieHeader(cookieHeader),
    shouldPreferAuthShell: readGuestAuthShellFromCookieHeader(cookieHeader),
  });
}

export async function resolveEntryStateFromCookieStore(
  cookieStore: Awaited<ReturnType<typeof import("next/headers").cookies>>,
): Promise<EntryState> {
  return resolveEntryStateFromIdentity({
    sessionToken: cookieStore.get(getSessionCookieName())?.value ?? null,
    guestToken: cookieStore.get(getGuestCookieName())?.value ?? null,
    shouldPreferAuthShell:
      cookieStore.get(getGuestAuthShellCookieName())?.value === "1",
  });
}

export function resolveProtectedPageAccess(
  state: EntryState,
  requirement: "authenticated" | "verified",
): { allowed: boolean; redirectTo: "/" | null } {
  const isAuthenticated =
    state.kind === "authenticated_unverified" ||
    state.kind === "authenticated_verified";
  const allowed =
    requirement === "authenticated"
      ? isAuthenticated
      : state.kind === "authenticated_verified";

  return {
    allowed,
    redirectTo: allowed ? null : "/",
  };
}
