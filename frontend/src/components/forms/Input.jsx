export default function Input({ icon: Icon, className = "", label, ...props }) {
  return (
    <div className="mb-5">
      {label && <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>}

      <div className="relative">
        {Icon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Icon className="h-5 w-5 text-gray-400" />
          </div>
        )}
        <input
          {...props}
          className={`w-full ${Icon ? "pl-10" : "pl-3"} pr-3 py-2 rounded-lg
          bg-white text-gray-900 placeholder-gray-400
          border border-gray-300
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          transition ${className}`}
        />
      </div>
    </div>
  );
}
