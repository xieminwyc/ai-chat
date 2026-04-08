import {
  createSessionRecord,
  createUser,
  deleteSessionByToken,
  findSessionByToken,
  findUserByEmail,
} from "@/server/auth/auth-repository";
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

export async function registerUser({ email, password }: RegisterUserInput) {
  const normalizedEmail = normalizeEmail(email);
  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    throw new Error("A user with this email already exists");
  }

  // service 层负责把“用户输入的明文密码”转换成“数据库可安全保存的 hash”。
  const passwordHash = await hashPassword(password);

  return createUser({
    email: normalizedEmail,
    passwordHash,
  });
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
