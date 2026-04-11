import { Resend } from "resend";

import { EmailDeliveryFailedError } from "@/server/auth/auth-errors";

type SendVerificationEmailInput = {
  email: string;
  verificationUrl: string;
};

type SendPasswordResetEmailInput = {
  email: string;
  resetUrl: string;
};

const resendConfigurationErrorMessages = [
  "RESEND_API_KEY is required to send verification emails.",
  "RESEND_FROM_EMAIL is required to send verification emails.",
];

function getResendApiKey() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new EmailDeliveryFailedError();
  }

  return apiKey;
}

function getResendFromEmail() {
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!fromEmail) {
    throw new EmailDeliveryFailedError();
  }

  return fromEmail;
}

export function isEmailDeliveryConfigurationError(
  error: unknown,
): error is Error {
  return (
    error instanceof Error &&
    resendConfigurationErrorMessages.includes(error.message)
  );
}

export function isEmailDeliveryError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (
      error instanceof EmailDeliveryFailedError ||
      resendConfigurationErrorMessages.includes(error.message) ||
      error.message.startsWith("Failed to send verification email:") ||
      error.message.startsWith("Failed to send password reset email:")
    )
  );
}

export async function sendVerificationEmail({
  email,
  verificationUrl,
}: SendVerificationEmailInput) {
  const resend = new Resend(getResendApiKey());
  const from = getResendFromEmail();

  const { error } = await resend.emails.send({
    from,
    to: [email],
    subject: "验证你的 AI Chat 邮箱",
    html: [
      "<div>",
      "<h1>验证你的 AI Chat 邮箱</h1>",
      "<p>点击下面的链接完成邮箱验证：</p>",
      `<p><a href="${verificationUrl}">${verificationUrl}</a></p>`,
      "<p>如果这不是你的操作，可以忽略这封邮件。</p>",
      "</div>",
    ].join(""),
    text: [
      "验证你的 AI Chat 邮箱",
      "",
      "点击下面的链接完成邮箱验证：",
      verificationUrl,
      "",
      "如果这不是你的操作，可以忽略这封邮件。",
    ].join("\n"),
  });

  if (error) {
    throw new EmailDeliveryFailedError(undefined, error);
  }
}

export async function sendPasswordResetEmail({
  email,
  resetUrl,
}: SendPasswordResetEmailInput) {
  const resend = new Resend(getResendApiKey());
  const from = getResendFromEmail();

  const { error } = await resend.emails.send({
    from,
    to: [email],
    subject: "重置你的 AI Chat 密码",
    html: [
      "<div>",
      "<h1>重置你的 AI Chat 密码</h1>",
      "<p>点击下面的链接设置新密码：</p>",
      `<p><a href="${resetUrl}">${resetUrl}</a></p>`,
      "<p>如果这不是你的操作，可以忽略这封邮件。</p>",
      "</div>",
    ].join(""),
    text: [
      "重置你的 AI Chat 密码",
      "",
      "点击下面的链接设置新密码：",
      resetUrl,
      "",
      "如果这不是你的操作，可以忽略这封邮件。",
    ].join("\n"),
  });

  if (error) {
    throw new EmailDeliveryFailedError(
      "Unable to send password reset email",
      error,
    );
  }
}
