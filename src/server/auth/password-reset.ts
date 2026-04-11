import { createHash, randomBytes } from "node:crypto";

const PASSWORD_RESET_TTL_HOURS = 1;
const DEFAULT_APP_URL = "http://localhost:3000";

export function createPasswordResetToken() {
  return randomBytes(32).toString("hex");
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getPasswordResetExpiresAt() {
  return new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000);
}

export function buildPasswordResetUrl(token: string) {
  const baseUrl = process.env.APP_URL ?? DEFAULT_APP_URL;
  const url = new URL("/reset-password", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}
