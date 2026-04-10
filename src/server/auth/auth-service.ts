import {
  createEmailVerificationToken as createEmailVerificationTokenRecord,
  createSessionRecord,
  createUser,
  deleteUnusedEmailVerificationTokensByUserId,
  deleteSessionByToken,
  findEmailVerificationTokenByHash,
  findSessionByToken,
  findUserByEmail,
  findUserById,
  markEmailVerificationTokenUsed,
  markUserEmailVerified,
  updateUserPasswordHash,
} from "@/server/auth/auth-repository";
import {
  buildEmailVerificationUrl,
  createEmailVerificationToken,
  getEmailVerificationExpiresAt,
  hashEmailVerificationToken,
} from "@/server/auth/email-verification";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSessionToken, getSessionExpiresAt } from "@/server/auth/session";

type RegisterUserInput = {
  email: string;
  password: string;
};

type LoginUserInput = {
  email: string;
  password: string;
};

function normalizeEmail(email: string) {
  // 统一邮箱格式，避免 Alice@example.com 和 alice@example.com 被当成两个账号。
  return email.trim().toLowerCase();
}

async function issueEmailVerificationForUser(user: {
  id: string;
  email: string;
}) {
  const rawToken = createEmailVerificationToken();
  const expiresAt = getEmailVerificationExpiresAt();
  const tokenHash = hashEmailVerificationToken(rawToken);

  await deleteUnusedEmailVerificationTokensByUserId(user.id);
  await createEmailVerificationTokenRecord({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  return {
    email: user.email,
    verificationUrl: buildEmailVerificationUrl(rawToken),
  };
}

export async function registerUser({ email, password }: RegisterUserInput) {
  const normalizedEmail = normalizeEmail(email);
  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    throw new Error("A user with this email already exists");
  }

  // service 层负责把“用户输入的明文密码”转换成“数据库可安全保存的 hash”。
  const passwordHash = await hashPassword(password);

  const user = await createUser({
    email: normalizedEmail,
    passwordHash,
  });

  const verification = await issueEmailVerificationForUser(user);

  return {
    user,
    ...verification,
  };
}

export async function loginUser({ email, password }: LoginUserInput) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    throw new Error("Invalid email or password");
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    throw new Error("Invalid email or password");
  }

  // 登录成功后，不把用户信息直接塞进 cookie，而是新建一条 session 记录。
  const sessionToken = createSessionToken();
  const expiresAt = getSessionExpiresAt();

  await createSessionRecord({
    token: sessionToken,
    userId: user.id,
    expiresAt,
  });

  return {
    sessionToken,
    expiresAt,
    // route handler 只需要把安全用户信息返回给前端。
    user: {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  };
}

export async function logoutUser(sessionToken: string) {
  // 退出登录的本质是让这个 session token 失效。
  await deleteSessionByToken(sessionToken);
}

// The cookie only carries an opaque session token.
// We always resolve the real user from the database on the server.
export async function getCurrentSession(sessionToken?: string | null) {
  if (!sessionToken) {
    return null;
  }

  const session = await findSessionByToken(sessionToken);

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    // 过期 session 顺手清掉，避免旧 token 一直留在库里。
    await deleteSessionByToken(sessionToken);
    return null;
  }

  return session;
}

export async function verifyEmailToken(token: string) {
  const tokenHash = hashEmailVerificationToken(token);
  const verificationToken = await findEmailVerificationTokenByHash(tokenHash);

  if (!verificationToken || verificationToken.usedAt) {
    throw new Error("Verification link is invalid or has already been used");
  }

  if (verificationToken.expiresAt.getTime() <= Date.now()) {
    throw new Error("Verification link has expired");
  }

  const verifiedAt = new Date();

  await markEmailVerificationTokenUsed(verificationToken.id, verifiedAt);

  return markUserEmailVerified(verificationToken.userId, verifiedAt);
}

export async function resendVerificationEmailForUser(userId: string) {
  const user = await findUserById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  if (user.emailVerifiedAt) {
    throw new Error("Email is already verified");
  }

  return issueEmailVerificationForUser(user);
}

export async function changePasswordForUser({
  userId,
  currentPassword,
  nextPassword,
}: {
  userId: string;
  currentPassword: string;
  nextPassword: string;
}) {
  const user = await findUserById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const passwordMatches = await verifyPassword(
    currentPassword,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw new Error("Current password is incorrect");
  }

  if (currentPassword === nextPassword) {
    throw new Error("New password must be different");
  }

  const nextPasswordHash = await hashPassword(nextPassword);

  return updateUserPasswordHash(userId, nextPasswordHash);
}
