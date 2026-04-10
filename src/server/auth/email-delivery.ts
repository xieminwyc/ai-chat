import { Resend } from "resend";

type SendVerificationEmailInput = {
  email: string;
  verificationUrl: string;
};

const resendConfigurationErrorMessages = [
  "RESEND_API_KEY is required to send verification emails.",
  "RESEND_FROM_EMAIL is required to send verification emails.",
];

function getResendApiKey() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required to send verification emails.");
  }

  return apiKey;
}

function getResendFromEmail() {
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!fromEmail) {
    throw new Error(
      "RESEND_FROM_EMAIL is required to send verification emails.",
    );
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
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    resendConfigurationErrorMessages.includes(error.message) ||
    error.message.startsWith("Failed to send verification email:")
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
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}
