"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { useAuth } from "@/context/auth-context";

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, status, user } = useAuth();

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <header className="border-b border-slate-200 bg-white/95">
      <nav
        aria-label="Primary navigation"
        className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-5 px-6 lg:px-8"
      >
        <Link className="flex items-center gap-2.5" href="/">
          <BrandMark />
          <span className="text-base font-semibold tracking-tight text-slate-950">
            DeployFlow
          </span>
        </Link>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {status === "loading" ? (
            <div
              aria-label="Loading account"
              className="h-9 w-28 rounded-lg bg-slate-100"
            />
          ) : status === "authenticated" ? (
            <>
              <Link
                aria-current={pathname === "/dashboard" ? "page" : undefined}
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950 sm:block"
                href="/dashboard"
              >
                Dashboard
              </Link>
              <span className="hidden max-w-52 truncate text-sm text-slate-500 md:block">
                {user?.email}
              </span>
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={handleLogout}
                type="button"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                href="/login"
              >
                Sign in
              </Link>
              <Link
                className="rounded-lg bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                href="/register"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
