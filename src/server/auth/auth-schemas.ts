import { z } from "zod";

// 注册时先把最基础的输入规则收紧，避免后面业务逻辑接到脏数据。
export const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
});

// 登录只校验“格式合法”和“字段存在”，密码是否正确留给 service 层判断。
export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    nextPassword: z.string().min(8).max(72),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.nextPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
