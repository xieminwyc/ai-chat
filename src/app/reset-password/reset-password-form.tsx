"use client";

import { useState } from "react";

type ResetPasswordFormProps = {
  token: string;
};

type ErrorPayload = {
  error?: string;
};

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
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
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          nextPassword,
          confirmPassword,
        }),
      });
      const data = (await response.json()) as ErrorPayload;

      if (!response.ok) {
        throw new Error(data.error || "重置密码失败");
      }

      setNextPassword("");
      setConfirmPassword("");
      setIsSuccess(true);
      setFeedback("现在可以返回登录继续使用账号。");
      setFeedbackTone("success");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "重置密码失败");
      setFeedbackTone("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <div className="grid gap-3">
        <p className="text-xs uppercase tracking-[0.25em] text-emerald-600">
          Success
        </p>
        <h2 className="text-2xl font-semibold text-neutral-950">
          密码重置成功
        </h2>
        <p className="text-sm leading-7 text-neutral-600">
          你的密码已经更新完成，不需要再次重复重置。
        </p>
        <p className="text-sm text-emerald-700" role="status">
          {feedback}
        </p>
        <a
          className="inline-flex min-h-11 w-fit items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30"
          href="/"
        >
          返回登录
        </a>
      </div>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
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
  );
}
