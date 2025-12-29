// src/components/patient/PatientCard.jsx
import { Link } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";
import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { localizeCountryName } from "../../utilsfront/geoLabels";



  function PatientCard({ patient, onDeleted, isDeleting }) {
  const { t, i18n } = useTranslation();
   const countryText = localizeCountryName(patient?.country, i18n.language);
    const handleDelete = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDeleting) return;
    if (!window.confirm(t("patients.card.confirmDelete"))) return;
    // La mutación (React Query) viene del padre vía onDeleted
   onDeleted?.(patient._id);
}, [isDeleting, onDeleted, patient?._id, t]);


  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition">
      <h3 className="text-lg font-semibold">
        <Link to={`/patients/${patient._id}`} className="hover:underline">
          {patient.fullname}
        </Link>
      </h3>

      <ul className="mt-2 text-sm text-gray-600 space-y-1">
        {patient?.age != null && <li>{t("patients.card.age")}: {patient.age}</li>}
        {patient?.country && <li>{t("patients.card.country")}: {countryText}</li>}
        {patient?.bloodtype && <li>{t("patients.card.blood")}: {patient.bloodtype}</li>}
        {patient?.email && <li>{t("patients.card.email")}: {patient.email}</li>}
        {patient?.phone && <li>{t("patients.card.phone")}: {patient.phone}</li>}
       
        {patient?.gender && (
          <li>{t("patients.card.gender")}: {patient.gender === "male" ? t("patients.card.genderMale") : t("patients.card.genderFemale")}</li>
        )}

           {patient.isDeceased && <li> {t("patients.card.status")}: {t("patients.card.statusDeceased")}</li>}
          {patient.isDeceased && patient.causeOfDeath && (
          <li>{t("patients.card.causeOfDeath")}: {patient.causeOfDeath}</li>
        )}
      </ul>

      <div className="mt-4 flex items-center justify-between">
        <Link
          to={`/diagnosis/patient/${patient._id}`}
          className="inline-block rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black"
        >
          {t("patients.card.viewDiagnoses")}
        </Link>

        <div className="flex items-center gap-3 text-gray-500">
          <Link
            to={`/patients/${patient._id}/edit`}
            title={t("patients.card.edit")}
            className="hover:text-blue-600"
          >
            <button>
            <Pencil className="w-5 h-5" />
            </button>
          </Link>

          <button
            type="button"
            onClick={handleDelete}
            title={t("patients.card.delete")}
            className="hover:text-red-600 disabled:opacity-50"
            disabled={isDeleting}
            aria-label={t("patients.card.delete")}
          >
            <Trash2 className="w-5 h-5 pointer-events-none" />
          </button>
        </div>
      </div>
    </article>
  );
}

export default React.memo(PatientCard);