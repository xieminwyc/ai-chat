const SESSION_TTL_DAYS = 7;
const SESSION_COOKIE_NAME = "ai-chat-session";

export function createSessionToken() {
  // token 必须是不可预测的随机值，这样浏览器拿到的只是“凭证”，不是用户信息。
  return crypto.randomUUID();
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getSessionExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
  return expiresAt;
}

export function getSessionCookieOptions() {
  // cookie 选项集中放在这里，后面 route handler 不用到处手写一遍。
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function readSessionTokenFromCookieHeader(cookieHeader?: string | null) {
  if (!cookieHeader) {
    return null;
  }

  const sessionCookieName = getSessionCookieName();

  // 这里手动从 cookie header 里把 session token 拆出来，交给 service 查数据库。
  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");

    if (name === sessionCookieName) {
      return valueParts.join("=") || null;
    }
  }

  return null;
}
