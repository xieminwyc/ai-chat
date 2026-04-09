import { verifyEmailToken } from "@/server/auth/auth-service";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  let isSuccess = false;
  let message = "Verification failed";
  let email = "";

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
    isSuccess = true;
    email = user.email;
  } catch (error) {
    message = error instanceof Error ? error.message : "Verification failed";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold">
        {isSuccess ? "邮箱验证成功" : "邮箱验证失败"}
      </h1>
      {isSuccess ? (
        <>
          <p>{email}</p>
          <p>现在可以回到应用继续登录和聊天。</p>
        </>
      ) : (
        <p>{message}</p>
      )}
    </main>
  );
}
