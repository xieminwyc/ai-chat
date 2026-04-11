export type AuthUserRecord = {
  id: string;
  email: string;
  // 永远只在服务端使用，不应该直接返回给前端。
  passwordHash: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// 前端和 route handler 只需要安全字段，不需要密码哈希。
export type AuthUserSummary = Omit<AuthUserRecord, "passwordHash">;

export type AuthSessionRecord = {
  id: string;
  // cookie 里保存的就是这个 token，本身不包含用户信息。
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  lastActiveAt: Date;
  // 设备信息，包含 { userAgent, ip, deviceType, browser, os }
  deviceInfo: unknown | null;
  ipAddress: string | null;
};

export type AuthSessionWithUser = AuthSessionRecord & {
  user: AuthUserSummary;
};

export type CreateUserInput = {
  email: string;
  passwordHash: string;
};

export type CreateSessionInput = {
  token: string;
  userId: string;
  expiresAt: Date;
};

export type EmailVerificationTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export type EmailVerificationTokenWithUser = EmailVerificationTokenRecord & {
  user: AuthUserRecord;
};

export type CreateSessionInput = {
  token: string;
  userId: string;
  expiresAt: Date;
  deviceInfo?: unknown;
  ipAddress?: string | null;
};

export type CreateEmailVerificationTokenInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

export type PasswordResetTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export type PasswordResetTokenWithUser = PasswordResetTokenRecord & {
  user: AuthUserRecord;
};

export type CreatePasswordResetTokenInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};
