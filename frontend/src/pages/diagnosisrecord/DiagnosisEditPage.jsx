import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { useDiagnosis, useUpdateDiagnosis } from "../../features/diagnostics/dhooks.js";
import Input from "../../components/forms/Input.jsx";
import Button from "../../components/forms/Button.jsx";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2 } from "lucide-react";

function ToggleButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${active ? "bg-blue-600 text-white hover:bg-blue-700" : "border border-blue-200 bg-white text-blue-700 hover:border-blue-300 hover:bg-blue-50"}`}
    >
      {children}
    </button>
  );
}

function LoadingState({ t }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50" aria-busy="true">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-3 h-4 w-36 animate-pulse rounded-full bg-slate-200" />
          <div className="h-8 w-64 max-w-full animate-pulse rounded-xl bg-slate-200" />
          <p
            role="status"
            className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600"
          >
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
            {t("common.loading")}
          </p>
        </section>
      </div>
    </main>
  );
}

export default function DiagnosisEditPage() {
  const { t } = useTranslation();
  const { patientId, diagnosisId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: diag, isLoading, isError } = useDiagnosis(diagnosisId);
  const updateDiagnosis = useUpdateDiagnosis(diagnosisId, patientId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [medicineText, setMedicineText] = useState("");
  const [needsMeds, setNeedsMeds] = useState("no"); // "yes" | "no"
  const [treatmentsText, setTreatmentsText] = useState("");
  const [needsTx, setNeedsTx] = useState("no"); // "yes" | "no"
  const [operationsText, setOperationsText] = useState("");
  const [needsOps, setNeedsOps] = useState("no");

  useEffect(() => {
    if (!diag) return;
    setTitle(diag.title ?? diag.Diagnostic ?? "");
    setDescription(diag.description ?? "");
    const arr = Array.isArray(diag.medicine) ? diag.medicine : [];
    const tx = Array.isArray(diag.treatment) ? diag.treatment : [];
    const op = Array.isArray(diag.operation) ? diag.operation : [];
    setTreatmentsText(tx.join(", "));
    setNeedsTx(tx.length > 0 ? "yes" : "no");
    setMedicineText(arr.join(", "));
    setNeedsMeds(arr.length > 0 ? "yes" : "no");
    setOperationsText(op.join(", "));
    setNeedsOps(op.length > 0 ? "yes" : "no");
  }, [diag]);

  // Evita flash en primer fetch
  if (isLoading && !diag) return <LoadingState t={t} />;
  if (isError || !diag) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950"> {t("diagnoses.detail.notFoundTitle")}</h1>
            <div className="mt-4">
              <Button full={false} variant="secondary" onClick={() => navigate(`/diagnosis/patient/${patientId}`)}>
                {t("diagnoses.detail.backToList")}
              </Button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const parse = (txt) => txt.split(",").map((s) => s.trim()).filter(Boolean);
  const handleBack = () => {
   const fromDetail = location.state?.from === "detail";
   const fallback = fromDetail
     ? `/diagnosis/patient/${patientId}/${diagnosisId}`
    : `/diagnosis/patient/${patientId}`;
   if (window.history.state && window.history.length > 1) navigate(-1);
   else navigate(fallback, { replace: true });
 };

  const onSubmit = (e) => {
    e.preventDefault();
     const meds = needsMeds === "yes" ? parse(medicineText) : [];
     const tx   = needsTx   === "yes" ? parse(treatmentsText) : [];
     const ops  = needsOps  === "yes" ? parse(operationsText) : [];

    if (!title.trim()) { toast.error(t("diagnoses.form.errors.titleRequired")); return; }

     if (!description.trim()) { toast.error(t("diagnoses.form.errors.descriptionRequired")); return; }  

     if (needsMeds === "yes" && meds.length === 0) {
      toast.error(t("diagnoses.form.errors.medsRequired"));
      return;
    }
    if (needsTx === "yes" && tx.length === 0) {
      toast.error(t("diagnoses.form.errors.txRequired"));
      return;
    }
    if (needsOps === "yes" && ops.length === 0) {
      toast.error(t("diagnoses.form.errors.opsRequired"));
      return;
    }

    updateDiagnosis.mutate(
      { title: title.trim(), description: description.trim(), medicine: meds, treatment: tx, operation: ops  },
      {
        onSuccess: () => handleBack(),
      }
    );
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <button
            onClick={handleBack}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("diagnoses.edit.back")}
          </button>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="mb-6 text-3xl font-semibold tracking-tight text-slate-950">{t("diagnoses.edit.title")}</h1>

          <form onSubmit={onSubmit} className="space-y-4" aria-busy={updateDiagnosis.isPending}>
            <Input label={t("diagnoses.form.titleLabel")} id="diagnosis-title" name="diagnosis-title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder={t("diagnoses.form.titlePlaceholder")} />

            <div>
              <label htmlFor="diagnosis-description" className="mb-1.5 block text-sm font-semibold text-slate-700">{t("diagnoses.form.descriptionLabel")}</label>
              <textarea
                id="diagnosis-description"
                rows={4}
                className="w-full min-h-11 rounded-xl border border-slate-300 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("diagnoses.form.descriptionPlaceholder")}
                required
              />
            </div>

            {/* Toggle + campo condicional para medicinas */}
            {/* Medications (misma ui que Patients) */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">{t("diagnoses.form.requiresMeds")}</label>
              <div className="flex gap-2 mb-2" role="group" aria-label={t("diagnoses.form.requiresMeds")}>
                <ToggleButton active={needsMeds === "yes"} onClick={() => setNeedsMeds("yes")}>
                   {t("diagnoses.form.yes")}
                </ToggleButton>
                <ToggleButton active={needsMeds === "no"} onClick={() => setNeedsMeds("no")}>
                   {t("diagnoses.form.no")}
                </ToggleButton>
              </div>
              {needsMeds === "yes" && (
               <Input
                  label={t("diagnoses.form.medsLabel")}
                  placeholder={t("diagnoses.form.medsPlaceholder")}
                  value={medicineText}
                  onChange={(e) => setMedicineText(e.target.value)}
                  required
               />
              )}
            </div>

             {/* Treatments */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">{t("diagnoses.form.requiresTx")}</label>
            <div className="flex gap-2 mb-2" role="group" aria-label={t("diagnoses.form.requiresTx")}>
              <ToggleButton active={needsTx === "yes"} onClick={() => setNeedsTx("yes")}>{t("diagnoses.form.yes")}</ToggleButton>
              <ToggleButton active={needsTx === "no"} onClick={() => setNeedsTx("no")}>{t("diagnoses.form.no")}</ToggleButton>
            </div>
            {needsTx === "yes" && (
              <Input
                label={t("diagnoses.form.txLabel")}
                placeholder={t("diagnoses.form.txPlaceholder")}
                value={treatmentsText}
                onChange={(e) => setTreatmentsText(e.target.value)}
                required
              />
           )}
          </div>

          {/* Operations */}
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">{t("diagnoses.form.requiresOps")}</label>
      <div className="flex gap-2 mb-2" role="group" aria-label={t("diagnoses.form.requiresOps")}>
        <ToggleButton active={needsOps === "yes"} onClick={() => setNeedsOps("yes")}>{t("diagnoses.form.yes")}</ToggleButton>
        <ToggleButton active={needsOps === "no"} onClick={() => setNeedsOps("no")}> {t("diagnoses.form.no")}</ToggleButton>
      </div>
      {needsOps === "yes" && (
        <Input
          label={t("diagnoses.form.opsLabel")}
          placeholder={t("diagnoses.form.opsPlaceholder")}
          value={operationsText}
          onChange={(e) => setOperationsText(e.target.value)}
          required
        />
      )}
    </div>

          <div className="grid grid-cols-1 gap-2 sm:flex sm:justify-end">
              <Button variant="secondary" className="w-full sm:w-auto" onClick={handleBack}>{t("diagnoses.edit.cancel")}</Button>
            <Button type="submit" className="w-full sm:w-auto" disabled={!title || (needsMeds === "yes" && medicineText.trim() === "")
            || (needsTx   === "yes" && treatmentsText.trim() === "") || (needsOps  === "yes" && operationsText.trim() === "")
            || !description || updateDiagnosis.isPending}
            loading={updateDiagnosis.isPending}>
              {updateDiagnosis.isPending ? t("diagnoses.edit.saving") : t("diagnoses.edit.save")}
            </Button>
          </div>
        </form>
      </section>
      </div>
    </main>
  );
}
