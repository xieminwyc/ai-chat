import { createHash, randomBytes } from "node:crypto";

const EMAIL_VERIFICATION_TTL_HOURS = 24;
const DEFAULT_APP_URL = "http://localhost:3000";

export function createEmailVerificationToken() {
  return randomBytes(32).toString("hex");
}

export function hashEmailVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getEmailVerificationExpiresAt() {
  return new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);
}

export function buildEmailVerificationUrl(token: string) {
  const baseUrl = process.env.APP_URL ?? DEFAULT_APP_URL;
  const url = new URL("/verify-email", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}
