"use client";

import { useState } from "react";

import { getApiErrorMessage, type ApiErrorPayload } from "@/lib/api-error";

export function VerificationAction({
  isEmailVerified,
}: {
  isEmailVerified: boolean;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"error" | "success" | null>(
    null,
  );

  async function handleResendVerificationEmail() {
    setIsSubmitting(true);
    setFeedback(null);
    setFeedbackTone(null);

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
      });
      const data = (await response.json()) as ApiErrorPayload;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, "重新发送验证邮件失败"));
      }

      setFeedback("验证邮件已重新发送，请检查邮箱。");
      setFeedbackTone("success");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "重新发送验证邮件失败",
      );
      setFeedbackTone("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="grid gap-4 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
          Verification Action
        </p>
        <h2 className="text-2xl font-semibold text-neutral-950">
          {isEmailVerified ? "邮箱已验证" : "邮箱未验证"}
        </h2>
        <p className="max-w-2xl text-sm leading-7 text-neutral-600">
          {isEmailVerified
            ? "当前账号已经完成验证，无需额外操作。"
            : "完成邮箱验证后，账号会更稳定地承接历史、恢复和后续高信任设置。"}
        </p>
      </div>

      {!isEmailVerified ? (
        <div className="flex flex-col items-start gap-3">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => void handleResendVerificationEmail()}
            type="button"
          >
            {isSubmitting ? "发送中..." : "重新发送验证邮件"}
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
      ) : null}
    </section>
  );
}
