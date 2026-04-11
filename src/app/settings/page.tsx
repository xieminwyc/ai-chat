import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  resolveEntryStateFromCookieStore,
  resolveProtectedPageAccess,
} from "@/server/auth/entry-state";
import { PasswordForm } from "@/app/settings/password-form";
import { SessionsForm } from "@/app/settings/sessions-form";

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

      <SessionsForm />

      <PasswordForm />

      <section className="grid gap-4 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
            Security roadmap
          </p>
          <h2 className="text-2xl font-semibold text-neutral-950">
            更高信任操作
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-neutral-600">
            后续适合放密码强化、敏感确认或更高级安全入口。
          </p>
        </div>
      </section>
    </main>
  );
}
