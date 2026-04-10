import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  resolveEntryStateFromCookieStore,
  resolveProtectedPageAccess,
} from "@/server/auth/entry-state";
import { PasswordForm } from "@/app/settings/password-form";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const entryState = await resolveEntryStateFromCookieStore(cookieStore);
  const access = resolveProtectedPageAccess(entryState, "verified");

  if (!access.allowed) {
    redirect(access.redirectTo ?? "/");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.3em] text-neutral-500">
          Settings
        </p>
        <h1 className="text-4xl font-semibold text-neutral-950">Settings</h1>
        <p className="max-w-2xl text-sm text-neutral-600">
          Verified users can manage higher-trust settings here.
        </p>
      </header>

      <PasswordForm />

      <section className="grid gap-4 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
            Security roadmap
          </p>
          <h2 className="text-2xl font-semibold text-neutral-950">
            Security roadmap
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-neutral-600">
            这里先放两块后续安全能力占位，让 settings 页开始形成真实结构。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4">
            <p className="text-sm font-semibold text-neutral-900">登录设备管理</p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              后续会在这里管理当前账号的登录设备与会话撤销。
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4">
            <p className="text-sm font-semibold text-neutral-900">更高信任操作</p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              后续适合放密码强化、敏感确认或更高级安全入口。
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
