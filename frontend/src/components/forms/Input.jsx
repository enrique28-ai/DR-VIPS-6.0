export default function Input({
  icon: Icon,
  className = "",
  containerClassName = "mb-5",
  label,
  ...props
}) {
  const inputId = props.id || props.name;
  const stateClasses =
    props.disabled || props.readOnly
      ? "bg-slate-100 text-slate-600 placeholder-slate-400 border-slate-200 cursor-not-allowed"
      : "bg-slate-50/80 text-slate-900 placeholder-slate-400 border-slate-300 hover:border-slate-400";

  return (
    <div className={containerClassName}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-semibold text-slate-700"
        >
          {label}
        </label>
      )}

      <div className="relative">
        {Icon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Icon className="h-5 w-5 text-slate-400" />
          </div>
        )}
        <input
          {...props}
          id={inputId}
          className={`w-full min-h-11 ${Icon ? "pl-10" : "pl-3"} pr-3 py-2 rounded-xl
          border text-sm shadow-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          disabled:opacity-100 transition-colors duration-150 ${stateClasses} ${className}`}
        />
      </div>
    </div>
  );
}
