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

import AccountPage from "@/app/account/page";

describe("/account page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextHeaders.cookies.mockResolvedValue({
      get: vi.fn(),
    });
  });

  it("redirects to home when the viewer is not authenticated", async () => {
    entryStateModule.resolveEntryStateFromCookieStore.mockResolvedValue({
      kind: "signed_out_guest_preview",
    });
    entryStateModule.resolveProtectedPageAccess.mockReturnValue({
      allowed: false,
      redirectTo: "/",
    });

    await expect(AccountPage()).rejects.toThrowError("NEXT_REDIRECT:/");

    expect(entryStateModule.resolveProtectedPageAccess).toHaveBeenCalledWith(
      { kind: "signed_out_guest_preview" },
      "authenticated",
    );
    expect(nextNavigation.redirect).toHaveBeenCalledWith("/");
  });

  it("renders basic account info for an authenticated unverified user", async () => {
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
      allowed: true,
      redirectTo: null,
    });

    render(await AccountPage());

    expect(
      screen.getByRole("heading", { name: "Account" }),
    ).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("user_1")).toBeInTheDocument();
    expect(screen.getAllByText("邮箱未验证")).toHaveLength(2);
    expect(screen.getByText("注册时间")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新发送验证邮件" }),
    ).toBeInTheDocument();
  });

  it("renders verified status for an authenticated verified user", async () => {
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

    render(await AccountPage());

    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("邮箱已验证")).toHaveLength(2);
    expect(screen.getByText("当前账号已经完成验证，无需额外操作。")).toBeInTheDocument();
  });
});
