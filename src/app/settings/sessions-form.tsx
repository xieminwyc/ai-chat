"use client";

import { useEffect, useState } from "react";

import { getApiErrorMessage, type ApiErrorPayload } from "@/lib/api-error";

type DeviceInfo = {
  userAgent: string;
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  browser: string;
  os: string;
};

type Session = {
  id: string;
  isCurrent: boolean;
  lastActiveAt: string;
  createdAt: string;
  deviceInfo: DeviceInfo | null;
  ipAddress: string | null;
};

type SessionsResponse = {
  sessions: Session[];
};

function formatDeviceInfo(deviceInfo: DeviceInfo | null): string {
  if (!deviceInfo) {
    return "未知设备";
  }

  const browser = deviceInfo.browser;
  const os = deviceInfo.os;

  return `${browser} on ${os}`;
}

function formatLastActiveTime(lastActiveAt: string): string {
  const now = Date.now();
  const time = new Date(lastActiveAt).getTime();
  const diffMs = now - time;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) {
    return "刚刚";
  }
  if (diffMins < 60) {
    return `${diffMins} 分钟前`;
  }
  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }
  if (diffDays < 7) {
    return `${diffDays} 天前`;
  }

  return new Date(lastActiveAt).toLocaleDateString("zh-CN");
}

function getDeviceIcon(deviceType: string): string {
  switch (deviceType) {
    case "desktop":
      return "🖥️";
    case "mobile":
      return "📱";
    case "tablet":
      return "📟";
    default:
      return "🔌";
  }
}

export function SessionsForm() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"error" | "success" | null>(
    null,
  );

  async function loadSessions() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/sessions");
      const data = (await response.json()) as SessionsResponse;

      if (!response.ok) {
        throw new Error("加载设备列表失败");
      }

      setSessions(data.sessions);
    } catch (error) {
      console.error("Failed to load sessions:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRevokeSession(sessionId: string) {
    if (!confirm("确定要撤销此设备的登录吗？")) {
      return;
    }

    setFeedback(null);
    try {
      const response = await fetch(`/api/auth/sessions/${sessionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorPayload;
        throw new Error(getApiErrorMessage(data, "撤销登录失败"));
      }

      setFeedback("设备已成功撤销");
      setFeedbackTone("success");
      await loadSessions();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "撤销登录失败");
      setFeedbackTone("error");
    }
  }

  async function handleRevokeAllOthers() {
    if (!confirm("确定要撤销所有其他设备的登录吗？只保留当前设备。")) {
      return;
    }

    setFeedback(null);
    try {
      const response = await fetch("/api/auth/sessions", {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorPayload;
        throw new Error(getApiErrorMessage(data, "撤销登录失败"));
      }

      setFeedback("所有其他设备已成功撤销");
      setFeedbackTone("success");
      await loadSessions();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "撤销登录失败");
      setFeedbackTone("error");
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  const currentSession = sessions.find((s) => s.isCurrent);
  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <section className="grid gap-4 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
          Sessions
        </p>
        <h2 className="text-2xl font-semibold text-neutral-950">
          登录设备管理
        </h2>
        <p className="max-w-2xl text-sm leading-7 text-neutral-600">
          查看和管理当前账号的所有登录设备。你可以撤销任何设备的登录权限。
        </p>
      </div>

      {feedback ? (
        <p
          className={`text-sm ${
            feedbackTone === "error" ? "text-red-700" : "text-emerald-700"
          }`}
          role={feedbackTone === "error" ? "alert" : "status"}
        >
          {feedback}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-neutral-500">加载中...</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-neutral-500">暂无登录设备</p>
      ) : (
        <div className="space-y-4">
          {/* 当前设备 */}
          {currentSession ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {getDeviceIcon(currentSession.deviceInfo?.deviceType || "unknown")}
                    </span>
                    <p className="text-sm font-semibold text-neutral-900">
                      📍 当前设备
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">
                    {formatDeviceInfo(currentSession.deviceInfo)}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    最后活跃: {formatLastActiveTime(currentSession.lastActiveAt)}
                  </p>
                  {currentSession.ipAddress ? (
                    <p className="text-xs text-neutral-500">
                      IP: {currentSession.ipAddress}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* 其他设备 */}
          {otherSessions.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-700">
                  其他设备 ({otherSessions.length})
                </p>
                <button
                  className="text-sm font-medium text-red-600 transition hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={otherSessions.length === 0}
                  onClick={handleRevokeAllOthers}
                  type="button"
                >
                  撤销所有其他设备
                </button>
              </div>

              <div className="space-y-3">
                {otherSessions.map((session) => (
                  <div
                    className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4"
                    key={session.id}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">
                            {getDeviceIcon(session.deviceInfo?.deviceType || "unknown")}
                          </span>
                          <p className="text-sm font-medium text-neutral-900">
                            {formatDeviceInfo(session.deviceInfo)}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-neutral-500">
                          最后活跃: {formatLastActiveTime(session.lastActiveAt)}
                        </p>
                        {session.ipAddress ? (
                          <p className="text-xs text-neutral-500">
                            IP: {session.ipAddress}
                          </p>
                        ) : null}
                      </div>
                      <button
                        className="text-sm font-medium text-red-600 transition hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => handleRevokeSession(session.id)}
                        type="button"
                      >
                        撤销
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
