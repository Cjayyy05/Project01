import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  footerPrompt: string;
  footerLabel: string;
  footerHref: string;
  children: ReactNode;
};

export function AuthShell({
  eyebrow,
  title,
  description,
  footerPrompt,
  footerLabel,
  footerHref,
  children,
}: AuthShellProps) {
  return (
    <div className="flex flex-1 items-center bg-slate-50 px-6 py-12">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="font-mono text-xs tracking-[0.18em] text-blue-300 uppercase">
              DeployFlow access
            </p>
            <p className="mt-5 text-3xl font-semibold tracking-tight">
              Your deployment workspace, without the noise.
            </p>
          </div>
          <p className="text-sm leading-6 text-slate-400">
            Connect trusted repositories, run them on your Docker host, and keep
            operational state in view.
          </p>
        </aside>

        <section className="px-6 py-10 sm:px-12 sm:py-14">
          <p className="text-sm font-semibold text-blue-700">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-8 text-center text-sm text-slate-600">
            {footerPrompt}{" "}
            <Link
              className="font-semibold text-blue-700 hover:text-blue-800"
              href={footerHref}
            >
              {footerLabel}
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
