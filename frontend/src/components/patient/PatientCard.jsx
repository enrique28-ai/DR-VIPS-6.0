// src/components/patient/PatientCard.jsx
import { Link } from "react-router-dom";
import { Pencil, Import, AlertTriangle } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  localizeCityName,
  localizeCountryName,
  localizeStateName,
} from "../../utilsfront/geoLabels";



  function PatientCard({ patient,  isGlobal = false }) {
  const { t, i18n } = useTranslation();
   const residenceText = [
    localizeCountryName(patient?.country, i18n.language),
    localizeStateName({ countryName: patient?.country, stateName: patient?.state, t }),
    localizeCityName({
      countryName: patient?.country,
      stateName: patient?.state,
      cityName: patient?.city,
      t,
    }),
  ]
    .filter(Boolean)
    .join(", ");
   const birthplaceText = [
    localizeCountryName(patient?.birthCountry, i18n.language),
    localizeStateName({ countryName: patient?.birthCountry, stateName: patient?.birthState, t }),
    localizeCityName({
      countryName: patient?.birthCountry,
      stateName: patient?.birthState,
      cityName: patient?.birthCity,
      t,
    }),
  ]
    .filter(Boolean)
    .join(", ");
   const isMinor = Number(patient?.age) < 18;
   const detailLink = isGlobal ? `/patients/global/${patient._id}` : `/patients/${patient._id}`;


  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition">
      <div className="flex items-start justify-between gap-2">
  <h3 className="text-lg font-semibold leading-tight">
    <Link to={detailLink} className="hover:underline">
      {patient.fullname}
    </Link>
  </h3>

  {patient?.isPendingApproval && (
    <span
      className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-200"
      title={t("patients.card.pendingHint")}
    >
      <AlertTriangle className="h-3 w-3" />
      <span>{t("patients.card.pending")}</span>
    </span>
  )}
</div>


      <ul className="mt-2 text-sm text-gray-600 space-y-1">
        {patient?.age != null && <li>{t("patients.card.age")}: {patient.age}</li>}
        {residenceText && <li>{t("patients.create.placeOfResidence")}: {residenceText}</li>}
        {birthplaceText && <li>{t("patients.create.placeOfBirth")}: {birthplaceText}</li>}
        {patient?.bloodtype && <li>{t("patients.card.blood")}: {patient.bloodtype}</li>}
        {patient?.email && <li>{t("patients.card.email")}: {patient.email}</li>}
        {isMinor && patient?.parentEmail && <li>{t("patients.create.parentEmail")}: {patient.parentEmail}</li>}
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
              className="p-2 text-gray-500 hover:text-blue-600"
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
