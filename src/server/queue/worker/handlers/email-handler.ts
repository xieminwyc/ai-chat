import { Resend } from "resend";
import type { JobHandler } from "../../queue-types";
import { EmailDeliveryFailedError } from "@/server/auth/auth-errors";

/**
 * 发送邮件的通用输入
 */
export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * 验证邮件任务输入
 */
export interface SendVerificationEmailInput extends SendEmailInput {
  verificationUrl: string;
}

/**
 * 密码重置邮件任务输入
 */
export interface SendPasswordResetEmailInput extends SendEmailInput {
  resetUrl: string;
}

/**
 * 获取 Resend API Key
 */
function getResendApiKey(): string {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new EmailDeliveryFailedError("RESEND_API_KEY is required");
  }
  return apiKey;
}

/**
 * 获取发件人邮箱
 */
function getResendFromEmail(): string {
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!fromEmail) {
    throw new EmailDeliveryFailedError("RESEND_FROM_EMAIL is required");
  }
  return fromEmail;
}

/**
 * 发送邮件的通用函数
 */
async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = getResendApiKey();
  const from = getResendFromEmail();

  console.log(`[EmailHandler] Resend API Key: ${apiKey.slice(0, 8)}...`);
  console.log(`[EmailHandler] From: ${from}`);
  console.log(`[EmailHandler] To: ${input.to}`);
  console.log(`[EmailHandler] Subject: ${input.subject}`);

  const resend = new Resend(apiKey);

  console.log(`[EmailHandler] Calling Resend API...`);

  const { error, data } = await resend.emails.send({
    from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) {
    // 详细的错误日志
    console.error(`[EmailHandler] ✗ Resend API Error:`);
    console.error(`  Name: ${error.name}`);
    console.error(`  Message: ${error.message}`);
    console.error(`  Full error:`, JSON.stringify(error, null, 2));
    throw new EmailDeliveryFailedError(
      `Resend API error: ${error.message}`,
      error
    );
  }

  console.log(`[EmailHandler] ✓ Email sent successfully!`);
  console.log(`  Resend ID: ${data?.id}`);
  console.log(`  To: ${input.to}`);
}

/**
 * 验证邮件任务处理器
 */
export class VerificationEmailHandler implements JobHandler<SendVerificationEmailInput, void> {
  readonly type = "SEND_VERIFICATION_EMAIL" as const;

  async handle(input: SendVerificationEmailInput): Promise<void> {
    console.log(`[EmailHandler] ========== SENDING VERIFICATION EMAIL ==========`);
    console.log(`[EmailHandler] To: ${input.to}`);
    console.log(`[EmailHandler] Verification URL: ${input.verificationUrl}`);

    await sendEmail({
      to: input.to,
      subject: "验证你的 AI Chat 邮箱",
      html: [
        "<div>",
        "<h1>验证你的 AI Chat 邮箱</h1>",
        "<p>点击下面的链接完成邮箱验证：</p>",
        `<p><a href="${input.verificationUrl}">${input.verificationUrl}</a></p>`,
        "<p>如果这不是你的操作，可以忽略这封邮件。</p>",
        "</div>",
      ].join(""),
      text: [
        "验证你的 AI Chat 邮箱",
        "",
        "点击下面的链接完成邮箱验证：",
        input.verificationUrl,
        "",
        "如果这不是你的操作，可以忽略这封邮件。",
      ].join("\n"),
    });

    console.log(`[EmailHandler] ========== EMAIL SENT SUCCESSFULLY ==========`);
  }
}

/**
 * 密码重置邮件任务处理器
 */
export class PasswordResetEmailHandler implements JobHandler<SendPasswordResetEmailInput, void> {
  readonly type = "SEND_PASSWORD_RESET_EMAIL" as const;

  async handle(input: SendPasswordResetEmailInput): Promise<void> {
    await sendEmail({
      to: input.to,
      subject: "重置你的 AI Chat 密码",
      html: [
        "<div>",
        "<h1>重置你的 AI Chat 密码</h1>",
        "<p>点击下面的链接设置新密码：</p>",
        `<p><a href="${input.resetUrl}">${input.resetUrl}</a></p>`,
        "<p>如果这不是你的操作，可以忽略这封邮件。</p>",
        "</div>",
      ].join(""),
      text: [
        "重置你的 AI Chat 密码",
        "",
        "点击下面的链接设置新密码：",
        input.resetUrl,
        "",
        "如果这不是你的操作，可以忽略这封邮件。",
      ].join("\n"),
    });
  }
}
