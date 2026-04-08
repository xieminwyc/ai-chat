import bcrypt from "bcryptjs";

const PASSWORD_SALT_ROUNDS = 10;

export async function hashPassword(password: string) {
  // 数据库里永远不存明文密码，只存 hash 后的结果。
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string) {
  // 登录时拿用户输入的密码去和数据库中的 hash 做比对。
  return bcrypt.compare(password, hash);
}
