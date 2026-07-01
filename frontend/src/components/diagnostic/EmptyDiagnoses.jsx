import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";


export default function EmptyDiagnoses({ patientId }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <FileText className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{t("diagnoses.empty.title")}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-600">
        {t("diagnoses.empty.description")}
      </p>
      <Link
        to={`/diagnosis/patient/${patientId}/new`}
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {t("diagnoses.create.cta")}
      </Link>
    </section>
  );
}
