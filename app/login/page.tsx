import type { Metadata } from "next";

import { loginOperator } from "@/app/actions/login";

export const metadata: Metadata = {
  title: "Operator Login | Guardrail Mesh",
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  searchParams?: { error?: string };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const error = searchParams?.error;
  const message =
    error === "configuration"
      ? "Operator login is not configured. Contact the system administrator."
      : error === "invalid"
        ? "Access denied. Verify the operator passphrase and try again."
        : null;

  return (
    <main className="min-h-screen bg-black px-6 py-12 font-mono text-white selection:bg-white selection:text-black">
      <div className="mx-auto grid min-h-[calc(100vh-6rem)] max-w-md place-items-center">
        <section className="w-full border border-neutral-800 bg-black">
          <header className="border-b border-neutral-800 px-5 py-4">
            <p className="text-[10px] tracking-[0.3em] text-neutral-500">GUARDRAIL MESH // OPERATOR GATE</p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight">AUTHORIZE ACCESS</h1>
          </header>
          <form action={loginOperator} className="space-y-5 p-5">
            <label className="block text-xs tracking-wider text-neutral-400" htmlFor="passphrase">
              MASTER PASSPHRASE
            </label>
            <input
              className="w-full rounded-none border border-neutral-700 bg-black px-3 py-3 text-sm text-white outline-none placeholder:text-neutral-700 focus:border-white"
              id="passphrase"
              name="passphrase"
              type="password"
              autoComplete="current-password"
              required
            />
            {message ? (
              <p className="border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-100" role="alert">
                {message}
              </p>
            ) : null}
            <button
              className="w-full rounded-none border border-white bg-white px-3 py-3 text-sm font-bold text-black transition-colors hover:bg-black hover:text-white"
              type="submit"
            >
              ENTER CONTROL ROOM →
            </button>
          </form>
          <footer className="border-t border-neutral-800 px-5 py-3 text-[10px] tracking-wider text-neutral-600">
            SESSION: HTTPONLY // EXPIRY: 60 MINUTES
          </footer>
        </section>
      </div>
    </main>
  );
}
