import AuthShell from "../../components/forms/AuthShell.jsx";
import { useTranslation } from "react-i18next";

export default function EligibilityInfoPage() {
  const { t } = useTranslation();
  return (
    <AuthShell title={t("auth.eligibility.title")}>
      <div className="space-y-4">
        <p className="text-pretty leading-6 text-slate-700">
          {t("auth.eligibility.p1")}
        </p>
        <p className="text-pretty leading-6 text-slate-600">
          {t("auth.eligibility.p2")}
        </p>
      </div>
    </AuthShell>
  );
}