"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-7 text-center shadow-sm">
        <p className="text-sm font-semibold text-red-700">Something went wrong</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          DeployFlow could not display this page. Try loading it again.
        </p>
        <button className="button-primary mt-6" onClick={reset} type="button">
          Try again
        </button>
      </div>
    </div>
  );
}
