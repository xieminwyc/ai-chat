import { prisma } from "@/lib/prisma";
import type {
  AuthSessionRecord,
  AuthSessionWithUser,
  AuthUserRecord,
  AuthUserSummary,
  CreateSessionInput,
  CreateUserInput,
} from "@/server/auth/auth-types";

export async function createUser(
  data: CreateUserInput,
): Promise<AuthUserSummary> {
  // 创建用户时只返回安全字段，避免 passwordHash 顺手泄露到上层。
  return prisma.user.create({
    data,
    select: {
      id: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function findUserByEmail(
  email: string,
): Promise<AuthUserRecord | null> {
  // 登录时需要 passwordHash 做密码比对，所以这里返回完整服务端字段。
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function findUserById(
  id: string,
): Promise<AuthUserRecord | null> {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createSessionRecord(
  data: CreateSessionInput,
): Promise<AuthSessionRecord> {
  // session 记录是真正的“登录态来源”，cookie 只是带着 token 回来找它。
  return prisma.session.create({
    data,
    select: {
      id: true,
      token: true,
      userId: true,
      expiresAt: true,
      createdAt: true,
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
      user: {
        select: {
          id: true,
          email: true,
          createdAt: true,
          updatedAt: true,
        },
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
