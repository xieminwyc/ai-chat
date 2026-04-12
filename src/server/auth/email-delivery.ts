import { enqueueJob } from "@/server/queue/queue-service";
import { EmailDeliveryFailedError } from "@/server/auth/auth-errors";

type SendVerificationEmailInput = {
  email: string;
  verificationUrl: string;
};

type SendPasswordResetEmailInput = {
  email: string;
  resetUrl: string;
};

/**
 * 检查是否是邮件配置错误
 * 注意：使用队列后，邮件发送是异步的，配置错误不会立即抛出
 */
export function isEmailDeliveryConfigurationError(
  error: unknown,
): error is Error {
  // 使用队列后，配置错误不会在注册时立即抛出
  // 返回 false 保持向后兼容
  return false;
}

/**
 * 检查是否是邮件发送错误
 * 注意：使用队列后，邮件发送是异步的，发送错误不会立即抛出
 */
export function isEmailDeliveryError(error: unknown): error is Error {
  // 使用队列后，发送错误不会在注册时立即抛出
  // 返回 false 保持向后兼容
  return false;
}

/**
 * 发送验证邮件（异步队列）
 */
export async function sendVerificationEmail({
  email,
  verificationUrl,
}: SendVerificationEmailInput) {
  // 将邮件发送任务加入队列（异步）
  await enqueueJob("SEND_VERIFICATION_EMAIL", {
    to: email,
    subject: "验证你的 AI Chat 邮箱",
    verificationUrl,
  });
}

/**
 * 发送密码重置邮件（异步队列）
 */
export async function sendPasswordResetEmail({
  email,
  resetUrl,
}: SendPasswordResetEmailInput) {
  // 将邮件发送任务加入队列（异步）
  await enqueueJob("SEND_PASSWORD_RESET_EMAIL", {
    to: email,
    subject: "重置你的 AI Chat 密码",
    resetUrl,
  });
}
