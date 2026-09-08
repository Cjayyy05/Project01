import Link from "next/link";

const assurances = [
  "Your infrastructure",
  "Real-time deployment state",
  "Straightforward operations",
];

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_50%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-14 px-6 py-20 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-28">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              Self-hosted deployment, made clear
            </div>
            <h1 className="text-balance text-5xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-7xl">
              Ship trusted code with confidence.
            </h1>
            <p className="mt-7 max-w-2xl text-pretty text-lg leading-8 text-slate-600 sm:text-xl">
              DeployFlow turns a public GitHub repository into a running Docker
              workload, with the status and operational context you need in one
              focused workspace.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link className="button-primary" href="/register">
                Create an account
                <span aria-hidden="true">→</span>
              </Link>
              <Link className="button-secondary" href="/login">
                Sign in
              </Link>
            </div>
          </div>

          <div className="self-end rounded-3xl border border-slate-200 bg-slate-950 p-2 shadow-2xl shadow-slate-300/50">
            <div className="rounded-[1.25rem] border border-white/10 bg-slate-900 p-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs font-semibold tracking-[0.16em] text-slate-400 uppercase">
                    Deployment pipeline
                  </p>
                  <p className="mt-1 text-sm text-slate-200">
                    A predictable path to production
                  </p>
                </div>
                <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                  Ready
                </span>
              </div>
              <ol className="space-y-5 pt-6">
                {["Clone repository", "Build image", "Start container"].map(
                  (step, index) => (
                    <li className="flex items-center gap-4" key={step}>
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 font-mono text-xs text-blue-300">
                        0{index + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{step}</p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full w-full rounded-full bg-blue-500" />
                        </div>
                      </div>
                    </li>
                  ),
                )}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto grid w-full max-w-7xl gap-px border-x border-slate-200 bg-slate-200 md:grid-cols-3">
          {assurances.map((assurance, index) => (
            <div className="bg-slate-50 px-6 py-8 lg:px-8" key={assurance}>
              <p className="font-mono text-xs text-blue-700">0{index + 1}</p>
              <p className="mt-3 font-medium text-slate-900">{assurance}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
