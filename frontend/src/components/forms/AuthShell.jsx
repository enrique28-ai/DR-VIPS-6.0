export default function AuthShell({ title, children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-200">
        <div className="px-8 pt-8 pb-4 text-center">
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        </div>
        <div className="px-8 pb-8">{children}</div>
      </div>
    </div>
  );
}
