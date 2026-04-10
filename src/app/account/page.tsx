import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  resolveEntryStateFromCookieStore,
  resolveProtectedPageAccess,
} from "@/server/auth/entry-state";
import { VerificationAction } from "@/app/account/verification-action";

function formatAccountDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default async function AccountPage() {
  const cookieStore = await cookies();
  const entryState = await resolveEntryStateFromCookieStore(cookieStore);
  const access = resolveProtectedPageAccess(entryState, "authenticated");

  if (!access.allowed) {
    redirect(access.redirectTo ?? "/");
  }

  if (
    entryState.kind !== "authenticated_unverified" &&
    entryState.kind !== "authenticated_verified"
  ) {
    redirect("/");
  }

  const user = entryState.user;
  const verificationLabel = user.emailVerifiedAt ? "邮箱已验证" : "邮箱未验证";
  const createdAtLabel = formatAccountDate(user.createdAt);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.3em] text-neutral-500">
          Account
        </p>
        <h1 className="text-4xl font-semibold text-neutral-950">Account</h1>
        <p className="max-w-2xl text-sm text-neutral-600">
          这里先展示最基础的账号信息，验证 `authenticated` 页面保护链路已经打通。
        </p>
      </header>

      <section className="grid gap-4 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
            Account Overview
          </p>
          <h2 className="text-2xl font-semibold text-neutral-950">
            基础账号信息
          </h2>
        </div>

        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
            User ID
          </p>
          <p className="font-mono text-sm text-neutral-900">{user.id}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
            Email
          </p>
          <p className="text-base text-neutral-900">{user.email}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
            Verification
          </p>
          <p className="text-base text-neutral-900">{verificationLabel}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
            注册时间
          </p>
          <p className="text-base text-neutral-900">{createdAtLabel}</p>
        </div>
      </section>

      <VerificationAction isEmailVerified={user.emailVerifiedAt !== null} />
    </main>
  );
}
