"use client";

import { useState } from "react";

import { getApiErrorMessage, type ApiErrorPayload } from "@/lib/api-error";

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"error" | "success" | null>(
    null,
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    setFeedbackTone(null);

    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          nextPassword,
          confirmPassword,
        }),
      });
      const data = (await response.json()) as ApiErrorPayload;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, "更新密码失败"));
      }

      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      setFeedback("密码已更新。");
      setFeedbackTone("success");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "更新密码失败");
      setFeedbackTone("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="grid gap-4 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
          Password
        </p>
        <h2 className="text-2xl font-semibold text-neutral-950">Password</h2>
        <p className="max-w-2xl text-sm leading-7 text-neutral-600">
          这是第一批 verified-only 安全动作。修改密码前仍然会经过服务端校验旧密码和新密码规则。
        </p>
      </div>

      <form className="grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm text-neutral-700">
          <span>当前密码</span>
          <input
            className="min-h-11 rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus-visible:ring-2 focus-visible:ring-slate-500/30"
            onChange={(event) => setCurrentPassword(event.target.value)}
            type="password"
            value={currentPassword}
          />
        </label>

        <label className="grid gap-2 text-sm text-neutral-700">
          <span>新密码</span>
          <input
            className="min-h-11 rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus-visible:ring-2 focus-visible:ring-slate-500/30"
            onChange={(event) => setNextPassword(event.target.value)}
            type="password"
            value={nextPassword}
          />
        </label>

        <label className="grid gap-2 text-sm text-neutral-700">
          <span>确认新密码</span>
          <input
            className="min-h-11 rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus-visible:ring-2 focus-visible:ring-slate-500/30"
            onChange={(event) => setConfirmPassword(event.target.value)}
            type="password"
            value={confirmPassword}
          />
        </label>

        <div className="flex flex-col items-start gap-3">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "更新中..." : "更新密码"}
          </button>

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
        </div>
      </form>
    </section>
  );
}
