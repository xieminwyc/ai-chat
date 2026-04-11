import type { ChatOwner } from "@/server/chat/chat-types";
import { RateLimitExceededError } from "@/server/rate-limit/rate-limit-error";
import { createSlidingWindowRateLimiter } from "@/server/rate-limit/sliding-window";
import { createTokenBucketRateLimiter } from "@/server/rate-limit/token-bucket";

const loginIpRateLimiter = createSlidingWindowRateLimiter({
  keyPrefix: "auth:login:ip",
  limit: 10,
  windowMs: 60 * 60 * 1000,
});

const loginEmailRateLimiter = createTokenBucketRateLimiter({
  keyPrefix: "auth:login:email",
  capacity: 3,
  refillTokens: 3,
  refillWindowMs: 60 * 1000,
});

const chatMessageRateLimiter = createTokenBucketRateLimiter({
  keyPrefix: "chat:message:user",
  capacity: 30,
  refillTokens: 30,
  refillWindowMs: 60 * 1000,
});

const loginRateLimitMessage = "Too many login attempts. Please try again later.";
const chatRateLimitMessage = "发送太快，请稍后再试。";

function normalizeRateLimitEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function enforceLoginRateLimit({
  email,
  ipAddress,
}: {
  email: string;
  ipAddress: string | null;
}) {
  if (ipAddress) {
    // IP 维度防“同一来源狂撞很多账号”。
    const ipResult = await loginIpRateLimiter.consume(ipAddress);

    if (!ipResult.allowed) {
      throw new RateLimitExceededError(ipResult, loginRateLimitMessage);
    }
  }

  // 邮箱维度防“某个账号在短时间内被反复试密码”。
  const emailResult = await loginEmailRateLimiter.consume(
    normalizeRateLimitEmail(email),
  );

  if (!emailResult.allowed) {
    throw new RateLimitExceededError(emailResult, loginRateLimitMessage);
  }
}

export async function enforceChatMessageRateLimit({
  actor,
}: {
  actor: ChatOwner;
}) {
  if (actor.kind !== "user") {
    // 游客目前靠 trial quota 控制，总量限制和频率限制先分开处理。
    return;
  }

  const result = await chatMessageRateLimiter.consume(actor.userId);

  if (!result.allowed) {
    throw new RateLimitExceededError(result, chatRateLimitMessage);
  }
}
