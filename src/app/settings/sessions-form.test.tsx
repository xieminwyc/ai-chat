import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fetch globally
global.fetch = vi.fn();

import { SessionsForm } from "@/app/settings/sessions-form";

describe("SessionsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [] }),
    });

    render(<SessionsForm />);
    expect(screen.getByText("加载中...")).toBeInTheDocument();
  });

  it("renders empty state when no sessions", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [] }),
    });

    render(<SessionsForm />);

    await waitFor(() => {
      expect(screen.getByText("暂无登录设备")).toBeInTheDocument();
    });
  });

  it("renders current and other sessions", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        sessions: [
          {
            id: "session_1",
            isCurrent: true,
            lastActiveAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            deviceInfo: {
              userAgent: "Mozilla/5.0...",
              deviceType: "desktop" as const,
              browser: "Chrome",
              os: "macOS",
            },
            ipAddress: "192.168.1.1",
          },
          {
            id: "session_2",
            isCurrent: false,
            lastActiveAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            deviceInfo: {
              userAgent: "Mozilla/5.0...",
              deviceType: "mobile" as const,
              browser: "Safari",
              os: "iOS",
            },
            ipAddress: "10.0.0.5",
          },
        ],
      }),
    });

    render(<SessionsForm />);

    await waitFor(() => {
      expect(screen.getByText("📍 当前设备")).toBeInTheDocument();
      expect(screen.getByText("其他设备 (1)")).toBeInTheDocument();
      expect(screen.getByText("Chrome on macOS")).toBeInTheDocument();
      expect(screen.getByText("Safari on iOS")).toBeInTheDocument();
    });
  });

  it("shows error when fetch fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ code: "auth.internal_error", message: "Failed to load" }),
    });

    render(<SessionsForm />);

    // Should not crash, just log error to console
    await waitFor(() => {
      expect(screen.queryByText("加载中...")).not.toBeInTheDocument();
    });
  });
});
