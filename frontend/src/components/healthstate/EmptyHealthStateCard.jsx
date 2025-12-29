// src/components/healthstate/EmptyHealthStateCard.jsx
import { useTranslation } from "react-i18next";

export default function EmptyHealthStateCard() {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        <span className="text-3xl">🩺</span>
      </div>
      <h2 className="text-xl font-semibold text-gray-900">
        {t("myHealthState.list.empty.title")}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
        {t("myHealthState.list.empty.description")}
      </p>
    </div>
  );
}