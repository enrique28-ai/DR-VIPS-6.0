import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Globe, Download } from "lucide-react";
import Button from "../../components/forms/Button.jsx";
import { useGlobalPatient, useImportPatient } from "../../features/patients/phooks.js";
import { localizeCountryName } from "../../utilsfront/geoLabels.js";

export default function GlobalPatientDetailPage() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const { id } = useParams();

  const { data: patient, isLoading, isError } = useGlobalPatient(id);
  const { mutate: importPatient, isPending } = useImportPatient();

  if (isLoading) return <div className="p-6 text-center">{t("common.loading") || "Loading..."}</div>;
  if (isError || !patient) return <div className="p-6 text-center text-red-500">{t("patients.detail.notFoundText") || "Not found"}</div>;

  // si ya lo “posees”, manda al detalle normal
  if (patient.amIOwner) {
    return (
      <div className="p-6 text-center">
        <p className="mb-3">{t("patients.global.alreadyOwned") || "You already have this patient."}</p>
        <Link className="text-blue-600 underline" to={`/patients/${patient._id}`}>
          {t("patients.global.goToDetail") || "Go to Patient Detail"}
        </Link>
      </div>
    );
  }

  const onImport = () => {
    importPatient(patient._id, {
      onSuccess: () => {
        // flujo pedido: regresar a PatientsPage para que lo veas en tu lista
        nav("/patients");
      },
    });
  };

  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
        <div className="flex items-center gap-2 font-semibold">
          <Globe className="h-5 w-5" />
          {t("patients.global.previewMode") || "Global Preview"}
        </div>
        <p className="mt-1 text-sm text-blue-800">
          {t("patients.global.previewDesc") || "Import this patient to your list to edit and view more actions."}
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">{patient.fullname}</h1>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm text-gray-700">
          <div>
            <div className="font-medium text-gray-900">{t("patients.detail.email") || "Email"}</div>
            <div>{patient.email || "—"}</div>
          </div>
          <div>
            <div className="font-medium text-gray-900">{t("patients.detail.phone") || "Phone"}</div>
            <div>{patient.phone || "—"}</div>
          </div>
          <div>
            <div className="font-medium text-gray-900">{t("patients.card.country") || "Country"}</div>
            <div>{patient.country ? localizeCountryName(patient.country, i18n.language) : "—"}</div>
          </div>
          <div>
            <div className="font-medium text-gray-900">{t("patients.card.age") || "Age"}</div>
            <div>{patient.age ?? "—"}</div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button onClick={onImport} disabled={isPending} className="inline-flex items-center justify-center gap-2">
            <Download className="h-5 w-5" />
            {isPending ? (t("patients.global.importing") || "Importing...") : (t("patients.global.importBtn") || "Import Patient")}
          </Button>

          <Button variant="secondary" onClick={() => nav("/patients/search")}>
            {t("common.back") || "Back"}
          </Button>
        </div>
      </div>
    </main>
  );
}
