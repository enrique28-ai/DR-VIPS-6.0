import AuthShell from "../../components/forms/AuthShell.jsx";
import { useTranslation } from "react-i18next";

export default function EligibilityInfoPage() {
  const { t } = useTranslation();
  return (
    <AuthShell title={t("auth.eligibility.title")}>
      <p className="text-gray-700">
        {t("auth.eligibility.p1")}
      </p>
      <p className="mt-2 text-gray-600">
       {t("auth.eligibility.p2")}
      </p>
    </AuthShell>
  );
}