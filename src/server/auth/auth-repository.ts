import { prisma } from "@/lib/prisma";
import type {
  AuthSessionRecord,
  AuthSessionWithUser,
  AuthUserRecord,
  AuthUserSummary,
  CreateSessionInput,
  CreateEmailVerificationTokenInput,
  CreatePasswordResetTokenInput,
  CreateUserInput,
  EmailVerificationTokenRecord,
  EmailVerificationTokenWithUser,
  PasswordResetTokenRecord,
  PasswordResetTokenWithUser,
} from "@/server/auth/auth-types";

const authUserSummarySelect = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const authUserRecordSelect = {
  ...authUserSummarySelect,
  passwordHash: true,
} as const;

const emailVerificationTokenRecordSelect = {
  id: true,
  userId: true,
  tokenHash: true,
  expiresAt: true,
  usedAt: true,
  createdAt: true,
} as const;

const passwordResetTokenRecordSelect = {
  id: true,
  userId: true,
  tokenHash: true,
  expiresAt: true,
  usedAt: true,
  createdAt: true,
} as const;

export async function createUser(
  data: CreateUserInput,
): Promise<AuthUserSummary> {
  // 创建用户时只返回安全字段，避免 passwordHash 顺手泄露到上层。
  return prisma.user.create({
    data,
    select: authUserSummarySelect,
  });
}

export async function findUserByEmail(
  email: string,
): Promise<AuthUserRecord | null> {
  // 登录时需要 passwordHash 做密码比对，所以这里返回完整服务端字段。
  return prisma.user.findUnique({
    where: { email },
    select: authUserRecordSelect,
  });
}

export async function findUserById(
  id: string,
): Promise<AuthUserRecord | null> {
  return prisma.user.findUnique({
    where: { id },
    select: authUserRecordSelect,
  });
}

export async function createSessionRecord(
  data: CreateSessionInput,
): Promise<AuthSessionRecord> {
  // session 记录是真正的”登录态来源”，cookie 只是带着 token 回来找它。
  return prisma.session.create({
    data: {
      token: data.token,
      userId: data.userId,
      expiresAt: data.expiresAt,
      deviceInfo: data.deviceInfo,
      ipAddress: data.ipAddress,
    },
    select: {
      id: true,
      token: true,
      userId: true,
      expiresAt: true,
      createdAt: true,
      lastActiveAt: true,
      deviceInfo: true,
      ipAddress: true,
    },
  });
}

export async function findSessionByToken(
  token: string,
): Promise<AuthSessionWithUser | null> {
  // 通过 token 反查 session 和 user，是每次请求恢复当前用户的关键一步。
  return prisma.session.findUnique({
    where: { token },
    select: {
      id: true,
      token: true,
      userId: true,
      expiresAt: true,
      createdAt: true,
      lastActiveAt: true,
      deviceInfo: true,
      ipAddress: true,
      user: {
        select: authUserSummarySelect,
      },
    },
  });
}

export async function deleteSessionByToken(token: string) {
  // 退出登录时删掉 session，旧 cookie 就算还在，也找不到有效登录态了。
  return prisma.session.deleteMany({
    where: { token },
  });
}

export async function createEmailVerificationToken(
  data: CreateEmailVerificationTokenInput,
): Promise<EmailVerificationTokenRecord> {
  return prisma.emailVerificationToken.create({
    data,
    select: emailVerificationTokenRecordSelect,
  });
}

export async function createPasswordResetToken(
  data: CreatePasswordResetTokenInput,
): Promise<PasswordResetTokenRecord> {
  return prisma.passwordResetToken.create({
    data,
    select: passwordResetTokenRecordSelect,
  });
}

export async function findEmailVerificationTokenByHash(
  tokenHash: string,
): Promise<EmailVerificationTokenWithUser | null> {
  return prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    select: {
      ...emailVerificationTokenRecordSelect,
      user: {
        select: authUserRecordSelect,
      },
    },
  });
}

export async function findPasswordResetTokenByHash(
  tokenHash: string,
): Promise<PasswordResetTokenWithUser | null> {
  return prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      ...passwordResetTokenRecordSelect,
      user: {
        select: authUserRecordSelect,
      },
    },
  });
}

export async function markEmailVerificationTokenUsed(
  id: string,
  usedAt: Date,
): Promise<EmailVerificationTokenRecord> {
  return prisma.emailVerificationToken.update({
    where: { id },
    data: { usedAt },
    select: emailVerificationTokenRecordSelect,
  });
}

export async function markPasswordResetTokenUsed(
  id: string,
  usedAt: Date,
): Promise<PasswordResetTokenRecord> {
  return prisma.passwordResetToken.update({
    where: { id },
    data: { usedAt },
    select: passwordResetTokenRecordSelect,
  });
}

export async function deleteUnusedEmailVerificationTokensByUserId(userId: string) {
  return prisma.emailVerificationToken.deleteMany({
    where: {
      userId,
      usedAt: null,
    },
  });
}

export async function deleteUnusedPasswordResetTokensByUserId(userId: string) {
  return prisma.passwordResetToken.deleteMany({
    where: {
      userId,
      usedAt: null,
    },
  });
}

export async function markUserEmailVerified(
  id: string,
  emailVerifiedAt: Date,
): Promise<AuthUserSummary> {
  return prisma.user.update({
    where: { id },
    data: { emailVerifiedAt },
    select: authUserSummarySelect,
  });
}

export async function updateUserPasswordHash(
  id: string,
  passwordHash: string,
): Promise<AuthUserSummary> {
  return prisma.user.update({
    where: { id },
    data: { passwordHash },
    select: authUserSummarySelect,
  });
}

// Session 管理相关方法

export async function findSessionsByUserId(
  userId: string,
): Promise<AuthSessionRecord[]> {
  return prisma.session.findMany({
    where: { userId },
    select: {
      id: true,
      token: true,
      userId: true,
      expiresAt: true,
      createdAt: true,
      lastActiveAt: true,
      deviceInfo: true,
      ipAddress: true,
    },
    orderBy: { lastActiveAt: "desc" },
  });
}

export async function findSessionById(
  id: string,
): Promise<AuthSessionRecord | null> {
  return prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      token: true,
      userId: true,
      expiresAt: true,
      createdAt: true,
      lastActiveAt: true,
      deviceInfo: true,
      ipAddress: true,
    },
  });
}

export async function deleteSessionById(id: string) {
  return prisma.session.delete({
    where: { id },
  });
}

export async function deleteAllUserSessionsExcept(
  userId: string,
  exceptToken: string,
) {
  return prisma.session.deleteMany({
    where: {
      userId,
      token: { not: exceptToken },
    },
  });
}

export async function deleteAllUserSessions(userId: string) {
  return prisma.session.deleteMany({
    where: { userId },
  });
}

export async function updateSessionLastActiveAt(
  token: string,
  lastActiveAt: Date,
): Promise<void> {
  await prisma.session.update({
    where: { token },
    data: { lastActiveAt },
  });
}
