/* eslint-disable react-refresh/only-export-components */
export function scalarValue(w) {
  return w && typeof w === "object" ? w.value ?? null : w ?? null;
}

export function formatDateTime(iso, t, locale) {
  if (!iso) return t("myHealthInfo.common.unknownDate");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("myHealthInfo.common.unknownDate");
  try {
    return locale ? d.toLocaleString(locale) : d.toLocaleString();
  } catch {
    return d.toLocaleString();
  }
}

export function formatDateOnly(iso, t, locale) {
  if (!iso) return t("myHealthInfo.common.notSpecified");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("myHealthInfo.common.notSpecified");
  try {
    return locale ? d.toLocaleDateString(locale) : d.toLocaleDateString();
  } catch {
    return d.toLocaleDateString();
  }
}

export function ScalarHistory({
  label,
  wrapper,
  formatter,
  t,
  useMetric,
  isHeight,
  isWeight,
  decimals = 2,
}) {
  if (
    !wrapper ||
    typeof wrapper !== "object" ||
    !Array.isArray(wrapper.alternatives) ||
    wrapper.alternatives.length < 2
  ) {
    return null;
  }

  const curRaw = wrapper.value ?? null;

  const toNum = (x) => {
    const n = typeof x === "number" ? x : Number(x);
    return Number.isFinite(n) ? n : null;
  };

  const toDisplay = (n) => {
    if (isHeight) return useMetric ? n : n / 0.3048;
    if (isWeight) return useMetric ? n : n / 0.45359237;
    return n;
  };

  const keyFor = (x) => {
    if (x === null || x === undefined || x === "") return null;

    if (isHeight || isWeight || typeof x === "number") {
      const n = toNum(x);
      if (n == null) return null;
      return isHeight || isWeight ? toDisplay(n).toFixed(decimals) : String(n);
    }

    if (typeof x === "boolean") {
      return x ? "true" : "false";
    }

    return String(x).trim().toLowerCase();
  };

  const curKey = keyFor(curRaw);

  const seen = new Set();
  const prevList = [];

  for (const v of wrapper.alternatives.slice(1)) {
    const k = keyFor(v);
    if (k == null) continue;

    if (curKey != null && k === curKey) continue;
    if (seen.has(k)) continue;

    seen.add(k);
    prevList.push(v);
  }

  if (prevList.length === 0) return null;

  const labelText = label
    ? t("myHealthInfo.common.previouslyRecorded", { label: label.toLowerCase() })
    : t("myHealthInfo.common.previouslyRecordedGeneric");

  return (
    <div className="mt-1 text-xs text-slate-600">
      <p>
        {labelText}{" "}
        <span className="font-medium">
          {prevList.map((v, idx) => (
            <span key={idx}>
              {idx > 0 ? ", " : ""}
              {formatter ? formatter(v) : String(v)}
            </span>
          ))}
        </span>
      </p>
    </div>
  );
}

export function ChipList({ items, t, tone = "default" }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-slate-500">{t("myHealthInfo.common.noneRecorded")}</p>;
  }

  const chipTone = {
    default: "border-slate-200 bg-slate-100 text-slate-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700 line-through opacity-80",
  };

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span
          key={it}
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${chipTone[tone]}`}
        >
          {it}
        </span>
      ))}
    </div>
  );
}