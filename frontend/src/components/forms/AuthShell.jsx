export default function AuthShell({ title, children }) {
  return (
    <div className="min-h-dvh overflow-y-auto bg-slate-50 flex items-start justify-center px-4 py-8 sm:px-6 lg:py-10">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_-32px_rgba(15,23,42,0.45)]">
        <div className="border-b border-slate-100 px-4 pt-7 pb-4 text-center sm:px-8 sm:pt-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
        </div>
        <div className="px-4 py-6 sm:px-8 sm:py-8">{children}</div>
      </div>
    </div>
  );
}
