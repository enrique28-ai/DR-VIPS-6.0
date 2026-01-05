// src/components/patient/PatientCard.jsx
import { Link } from "react-router-dom";
import { Pencil, Import } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { localizeCountryName } from "../../utilsfront/geoLabels";



  function PatientCard({ patient,  isGlobal = false }) {
  const { t, i18n } = useTranslation();
   const countryText = localizeCountryName(patient?.country, i18n.language);
   const detailLink = isGlobal ? `/patients/global/${patient._id}` : `/patients/${patient._id}`;


  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition">
      <h3 className="text-lg font-semibold">
        <Link  to={detailLink} className="hover:underline">
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
        {isGlobal ? (
          <Link
            to={detailLink}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Import className="h-4 w-4" />
            {t("patients.global.viewToImport") || "View & Import"}
          </Link>
        ) : (
          <>
            <Link
              to={`/diagnosis/patient/${patient._id}`}
              className="inline-block rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black"
            >
              {t("patients.card.viewDiagnoses")}
            </Link>

            <Link
              to={`/patients/${patient._id}/edit`}
              title={t("patients.card.edit")}
              className="hover:text-blue-600"
            >
              <Pencil className="h-5 w-5" />
            </Link>
          </>
        )}
      </div>
    </article>
  );
}
export default React.memo(PatientCard);