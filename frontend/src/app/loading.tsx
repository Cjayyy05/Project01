export default function Loading() {
  return (
    <div
      className="flex flex-1 items-center justify-center px-6 py-16"
      role="status"
    >
      <div className="text-center">
        <div className="mx-auto h-2 w-32 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full w-2/3 rounded-full bg-blue-600" />
        </div>
        <p className="mt-4 text-sm font-medium text-slate-600">
          Loading DeployFlow…
        </p>
      </div>
    </div>
  );
}
