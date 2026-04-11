import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold">重置密码失败</h1>
        <p>Password reset link is missing</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <header className="space-y-2 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-neutral-500">
          Reset password
        </p>
        <h1 className="text-4xl font-semibold text-neutral-950">
          重置你的密码
        </h1>
        <p className="text-sm leading-7 text-neutral-600">
          这一步会通过一次性 token 完成密码恢复，成功后原链接不能重复使用。
        </p>
      </header>

      <section className="grid gap-4 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <ResetPasswordForm token={token} />
      </section>
    </main>
  );
}
