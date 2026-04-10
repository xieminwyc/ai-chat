import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  resolveEntryStateFromCookieStore,
  resolveProtectedPageAccess,
} from "@/server/auth/entry-state";

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

      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-base text-neutral-900">
          这个页面目前还是最小占位，但访问门槛已经提升到 verified。
        </p>
      </section>
    </main>
  );
}
