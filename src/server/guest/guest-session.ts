const GUEST_TTL_DAYS = 14;
const GUEST_COOKIE_NAME = "ai-chat-guest";
const GUEST_COOKIE_MAX_AGE = GUEST_TTL_DAYS * 24 * 60 * 60;

export function createGuestToken() {
  return crypto.randomUUID();
}

export function getGuestCookieName() {
  return GUEST_COOKIE_NAME;
}

export function getGuestExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + GUEST_TTL_DAYS);
  return expiresAt;
}

export function getGuestCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  };
}

export function readGuestTokenFromCookieHeader(cookieHeader?: string | null) {
  if (!cookieHeader) {
    return null;
  }

  const guestCookieName = getGuestCookieName();

  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");

    if (name === guestCookieName) {
      return valueParts.join("=") || null;
    }
  }

  return null;
}
