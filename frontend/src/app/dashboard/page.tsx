"use client";

import { useAuth } from "@/context/auth-context";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="flex-1 bg-slate-50 px-6 py-12 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-10 shadow-sm sm:px-10">
          <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-semibold text-blue-700">
                Protected workspace
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                You’re signed in.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                Your authentication session is active for {user?.email}. Project
                and deployment management will be added in the next milestone.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold tracking-[0.12em] text-emerald-700 uppercase">
                Session status
              </p>
              <p className="mt-1 text-sm font-medium text-emerald-950">
                Authenticated
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="font-mono text-xs text-slate-500">01 / IDENTITY</p>
            <h2 className="mt-3 text-lg font-semibold text-slate-950">
              Account connected
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              DeployFlow verified your access token with the backend authentication
              API.
            </p>
          </section>
          <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-100/50 p-6">
            <p className="font-mono text-xs text-slate-500">02 / NEXT</p>
            <h2 className="mt-3 text-lg font-semibold text-slate-950">
              Workspace foundation ready
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Project and deployment interfaces are intentionally not part of this
              milestone.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
