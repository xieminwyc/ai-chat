import { z } from "zod";

export const chatQuerySchema = z.object({
  chatId: z.string().cuid().optional(),
});

export const renameChatSchema = z.object({
  title: z.string().trim().min(1).max(80),
});

export const postChatSchema = z.object({
  chatId: z.string().cuid().optional(),
  message: z.string().trim().min(1).max(4000),
});
