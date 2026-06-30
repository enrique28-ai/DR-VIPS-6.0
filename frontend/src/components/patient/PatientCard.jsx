// src/components/patient/PatientCard.jsx
import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Import, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  localizeCityName,
  localizeCountryName,
  localizeStateName,
} from "../../utilsfront/geoLabels";

const formatLocation = ({ country, state, city, language, t }) =>
  [
    localizeCountryName(country, language),
    localizeStateName({ countryName: country, stateName: state, t }),
    localizeCityName({
      countryName: country,
      stateName: state,
      cityName: city,
      t,
    }),
  ]
    .filter(Boolean)
    .join(", ");

function DetailRow({ label, value, tone = "default" }) {
  if (!value) return null;

  const valueTone =
    tone === "danger"
      ? "text-red-700"
      : tone === "warning"
        ? "text-amber-800"
        : "text-slate-900";

  return (
    <li className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="sr-only">: </span>
      <span className={`mt-0.5 block break-words text-sm font-medium ${valueTone}`}>
        {value}
      </span>
    </li>
  );
}

function PatientCard({ patient, isGlobal = false }) {
  const { t, i18n } = useTranslation();
  const residenceText = formatLocation({
    country: patient?.country,
    state: patient?.state,
    city: patient?.city,
    language: i18n.language,
    t,
  });
  const birthplaceText = formatLocation({
    country: patient?.birthCountry,
    state: patient?.birthState,
    city: patient?.birthCity,
    language: i18n.language,
    t,
  });
  const isMinor = Number(patient?.age) < 18;
  const detailLink = isGlobal ? `/patients/global/${patient._id}` : `/patients/${patient._id}`;
  const genderText =
    patient?.gender === "male"
      ? t("patients.card.genderMale")
      : patient?.gender === "female"
        ? t("patients.card.genderFemale")
        : patient?.gender;
  const railClass = patient?.isDeceased
    ? "bg-red-500"
    : patient?.isPendingApproval
      ? "bg-amber-400"
      : "bg-slate-200";

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md sm:p-5">
      <div className={`absolute inset-y-0 left-0 w-1 ${railClass}`} aria-hidden="true" />

      <div className="flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-tight text-slate-950">
            <Link
              to={detailLink}
              className="break-words rounded-md hover:text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {patient.fullname}
            </Link>
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {patient?.age != null && (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {t("patients.card.age")}: {patient.age}
              </span>
            )}
            {patient?.bloodtype && (
              <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                {t("patients.card.blood")}: {patient.bloodtype}
              </span>
            )}
            {genderText && (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {t("patients.card.gender")}: {genderText}
              </span>
            )}
          </div>
        </div>

        {patient?.isPendingApproval && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
            title={t("patients.card.pendingHint")}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{t("patients.card.pending")}</span>
          </span>
        )}
      </div>

      <ul className="mt-4 grid gap-2 pl-1">
        <DetailRow label={t("patients.create.placeOfResidence")} value={residenceText} />
        <DetailRow label={t("patients.create.placeOfBirth")} value={birthplaceText} />
        <DetailRow label={t("patients.card.email")} value={patient?.email} />
        <DetailRow
          label={t("patients.create.parentEmail")}
          value={isMinor ? patient?.parentEmail : ""}
        />
        <DetailRow label={t("patients.card.phone")} value={patient?.phone} />
        {patient?.isDeceased && (
          <DetailRow
            label={t("patients.card.status")}
            value={t("patients.card.statusDeceased")}
            tone="danger"
          />
        )}
        {patient?.isDeceased && patient?.causeOfDeath && (
          <DetailRow
            label={t("patients.card.causeOfDeath")}
            value={patient.causeOfDeath}
            tone="danger"
          />
        )}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-3 pl-1">
        {isGlobal ? (
          <Link
            to={detailLink}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <Import className="h-4 w-4" />
            {t("patients.global.viewToImport") || "View & Import"}
          </Link>
        ) : (
          <>
            <Link
              to={`/diagnosis/patient/${patient._id}`}
              className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {t("patients.card.viewDiagnoses")}
            </Link>

            <Link
              to={`/patients/${patient._id}/edit`}
              title={t("patients.card.edit")}
              aria-label={t("patients.card.edit")}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
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
