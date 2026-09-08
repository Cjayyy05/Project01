export default function ProjectDetailsLoading() {
  return (
    <div className="flex-1 bg-slate-50 px-6 py-10 lg:px-8 lg:py-12">
      <div
        className="mx-auto w-full max-w-7xl animate-pulse"
        role="status"
        aria-label="Loading project details"
      >
        <div className="h-5 w-32 rounded bg-slate-200" />
        <div className="mt-7 h-10 w-72 max-w-full rounded bg-slate-200" />
        <div className="mt-4 h-5 w-full max-w-xl rounded bg-slate-200" />
        <div className="mt-9 grid gap-5 lg:grid-cols-3">
          <div className="h-72 rounded-2xl border border-slate-200 bg-white lg:col-span-2" />
          <div className="h-72 rounded-2xl border border-slate-200 bg-white" />
        </div>
        <div className="mt-5 h-80 rounded-2xl border border-slate-200 bg-white" />
      </div>
    </div>
  );
}
