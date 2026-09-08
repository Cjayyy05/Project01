export function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="grid h-8 w-8 grid-cols-2 gap-1 rounded-lg bg-slate-950 p-1.5 shadow-sm"
    >
      <span className="rounded-sm bg-blue-500" />
      <span className="rounded-sm bg-white" />
      <span className="rounded-sm bg-white/70" />
      <span className="rounded-sm bg-blue-300" />
    </span>
  );
}
