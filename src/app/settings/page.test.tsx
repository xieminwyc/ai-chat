import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nextHeaders = vi.hoisted(() => ({
  cookies: vi.fn(),
}));

const nextNavigation = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

const entryStateModule = vi.hoisted(() => ({
  resolveEntryStateFromCookieStore: vi.fn(),
  resolveProtectedPageAccess: vi.fn(),
}));

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
vi.mock("@/server/auth/entry-state", () => entryStateModule);

import SettingsPage from "@/app/settings/page";

describe("/settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextHeaders.cookies.mockResolvedValue({
      get: vi.fn(),
    });
  });

  it("redirects to home when the viewer is signed out", async () => {
    entryStateModule.resolveEntryStateFromCookieStore.mockResolvedValue({
      kind: "signed_out_guest_preview",
    });
    entryStateModule.resolveProtectedPageAccess.mockReturnValue({
      allowed: false,
      redirectTo: "/",
    });

    await expect(SettingsPage()).rejects.toThrowError("NEXT_REDIRECT:/");

    expect(entryStateModule.resolveProtectedPageAccess).toHaveBeenCalledWith(
      { kind: "signed_out_guest_preview" },
      "verified",
    );
  });

  it("redirects to home for an authenticated but unverified user", async () => {
    entryStateModule.resolveEntryStateFromCookieStore.mockResolvedValue({
      kind: "authenticated_unverified",
      user: {
        id: "user_1",
        email: "alice@example.com",
        emailVerifiedAt: null,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      },
      mergeCandidate: null,
    });
    entryStateModule.resolveProtectedPageAccess.mockReturnValue({
      allowed: false,
      redirectTo: "/",
    });

    await expect(SettingsPage()).rejects.toThrowError("NEXT_REDIRECT:/");
    expect(nextNavigation.redirect).toHaveBeenCalledWith("/");
  });

  it("renders the page for a verified user", async () => {
    entryStateModule.resolveEntryStateFromCookieStore.mockResolvedValue({
      kind: "authenticated_verified",
      user: {
        id: "user_2",
        email: "bob@example.com",
        emailVerifiedAt: new Date("2026-04-09T00:00:00.000Z"),
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      },
      mergeCandidate: null,
    });
    entryStateModule.resolveProtectedPageAccess.mockReturnValue({
      allowed: true,
      redirectTo: null,
    });

    render(await SettingsPage());

    expect(
      screen.getByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Verified users can manage higher-trust settings here."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Password" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Security roadmap" }),
    ).toBeInTheDocument();
  });
});
