export function ProjectListSkeleton() {
  return (
    <div
      aria-label="Loading projects"
      className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
      role="status"
    >
      {[0, 1, 2].map((item) => (
        <div
          className="min-h-64 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          key={item}
        >
          <div className="h-5 w-2/5 rounded bg-slate-200" />
          <div className="mt-3 h-4 w-3/5 rounded bg-slate-100" />
          <div className="mt-8 h-px bg-slate-100" />
          <div className="mt-5 grid grid-cols-2 gap-5">
            <div className="h-10 rounded bg-slate-100" />
            <div className="h-10 rounded bg-slate-100" />
          </div>
          <div className="mt-6 h-px bg-slate-100" />
          <div className="mt-5 h-4 w-1/2 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
