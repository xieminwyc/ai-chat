import { verifyEmailToken } from "@/server/auth/auth-service";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold">邮箱验证失败</h1>
        <p>Verification link is missing</p>
      </main>
    );
  }

  try {
    const user = await verifyEmailToken(token);

    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold">邮箱验证成功</h1>
        <p>{user.email}</p>
        <p>现在可以回到应用继续登录和聊天。</p>
      </main>
    );
  } catch (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold">邮箱验证失败</h1>
        <p>{error instanceof Error ? error.message : "Verification failed"}</p>
      </main>
    );
  }
}
