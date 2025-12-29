import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";


export default function EmptyPatients() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="rounded-full bg-gray-100 p-6 mb-4">
        <span className="text-3xl">🩺</span>
      </div>
      <h3 className="text-2xl font-bold">{t("patients.empty.title")}</h3>
      <p className="mt-2 max-w-md text-gray-600">
         {t("patients.empty.description")}
      </p>
      <Link
        to="/patients/new"
        className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        {t("patients.empty.cta")}
      </Link>
    </div>
  );
}
