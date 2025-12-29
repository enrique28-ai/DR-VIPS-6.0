import { Link } from "react-router-dom";
import Button from "../forms/Button.jsx";
import { useTranslation } from "react-i18next";


export default function EmptyDiagnoses({ patientId }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-6">
        <span className="text-3xl">🧪</span>
      </div>
      <h3 className="text-2xl font-bold">{t("diagnoses.empty.title")}</h3>
      <p className="mt-2 max-w-md text-gray-600">
        {t("diagnoses.empty.description")}
      </p>

      <Link to={`/diagnosis/patient/${patientId}/new`} className="mt-6">
        <Button>{t("diagnoses.create.cta")}</Button>
      </Link>
    </div>
  );
}

