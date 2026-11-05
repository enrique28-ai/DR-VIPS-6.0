import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import Input from "../../components/forms/Input.jsx";
import Button from "../../components/forms/Button.jsx";
import { useRequestPatientAccess } from "../../features/patients/phooks.js";

export default function SearchGlobalPatient() {
  const { t } = useTranslation();
  const [mode, setMode] = useState("adult");
  const [fullname, setFullname] = useState("");
  const [email, setEmail] = useState("");
  const [validationError, setValidationError] = useState(false);
  const nameInput = useRef(null);
  const request = useRequestPatientAccess();
  const hasError = validationError || request.isError;

  const changeField = (setter, value) => {
    setter(value);
    setValidationError(false);
    request.reset();
  };

  const submit = (event) => {
    event.preventDefault();
    if (request.isPending) return;
    const form = event.currentTarget;
    if (!form.checkValidity() || !fullname.trim() || !email.trim()) {
      setValidationError(true);
      (form.querySelector(":invalid") || nameInput.current)?.focus();
      return;
    }
    setValidationError(false);
    request.mutate({ mode, fullname: fullname.trim(), email: email.trim() });
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <Link to="/patients" className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("patients.detail.back")}
          </Link>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">{t("patients.identification.title")}</h1>
          <p id="patient-identification-hint" className="mt-2 text-sm leading-6 text-slate-600">{t("patients.identification.description")}</p>
        </header>

        <form onSubmit={submit} noValidate aria-busy={request.isPending} aria-describedby="patient-identification-hint" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <fieldset disabled={request.isPending} className="mb-5">
            <legend className="mb-2 text-sm font-semibold text-slate-700">{t("patients.identification.patientType")}</legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
              {["adult", "minor"].map((value) => (
                <label key={value} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-800">
                  <input type="radio" name="patientType" value={value} checked={mode === value} onChange={() => changeField(setMode, value)} className="h-4 w-4 accent-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500" />
                  {t(`patients.identification.${value}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <Input id="patient-identification-name" name="fullname" ref={nameInput}
            label={t("patients.identification.fullname")} value={fullname} required maxLength={200}
            autoComplete="off" disabled={request.isPending} aria-invalid={validationError || undefined}
            aria-describedby={hasError ? "patient-identification-error" : undefined}
            onChange={(event) => changeField(setFullname, event.target.value)} />
          <Input id="patient-identification-email" name="email" type="email"
            label={t(mode === "minor" ? "patients.identification.guardianEmail" : "patients.identification.email")}
            value={email} required maxLength={254} autoComplete="off" disabled={request.isPending}
            aria-invalid={validationError || undefined}
            aria-describedby={hasError ? "patient-identification-error" : undefined}
            onChange={(event) => changeField(setEmail, event.target.value)} />

          {hasError && (
            <p id="patient-identification-error" role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {t(validationError || request.error?.response?.status === 400 ? "patients.identification.validationError" : "patients.identification.error")}
            </p>
          )}
          {request.isSuccess && (
            <p role="status" aria-live="polite" className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
              {t("patients.identification.confirmation")}
            </p>
          )}
          <Button type="submit" loading={request.isPending} disabled={request.isPending} full={false} className="w-full sm:w-auto">
            {t(request.isPending ? "patients.identification.sending" : "patients.identification.submit")}
          </Button>
        </form>

        <Link to="/patients/new" className="mt-5 inline-flex min-h-11 items-center rounded-lg px-1 text-sm font-semibold text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500">
          {t("patients.searchGlobal.createNew")}
        </Link>
      </div>
    </main>
  );
}
