"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/context/auth-context";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { error, retry, status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [router, status]);

  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-7 text-center shadow-sm">
          <p className="text-sm font-semibold text-red-700">Session check failed</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
          <button
            className="button-secondary mt-6"
            onClick={() => void retry()}
            type="button"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <div
        className="flex flex-1 items-center justify-center px-6 py-16"
        role="status"
      >
        <div className="text-center">
          <div className="mx-auto grid h-10 w-10 grid-cols-2 gap-1 rounded-xl bg-slate-950 p-2">
            <span className="rounded-sm bg-blue-500" />
            <span className="rounded-sm bg-white" />
            <span className="rounded-sm bg-white/70" />
            <span className="rounded-sm bg-blue-300" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-600">
            Checking your session…
          </p>
        </div>
      </div>
    );
  }

  return children;
}
