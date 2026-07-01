import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCreateDiagnosis } from "../../features/diagnostics/dhooks.js";
import Input from "../../components/forms/Input.jsx";
import Button from "../../components/forms/Button.jsx";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

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

export default function DiagnosisCreatePage() {
  const { t } = useTranslation();
  const { patientId } = useParams();
  const navigate = useNavigate();
  const createDiagnosis = useCreateDiagnosis(patientId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [medicineText, setMedicineText] = useState("");
  const [needsMeds, setNeedsMeds] = useState("no"); // "yes" | "no"
  const [treatmentsText, setTreatmentsText] = useState("");
  const [needsTx, setNeedsTx] = useState("no"); // "yes" | "no"
  const [operationsText, setOperationsText] = useState("");
  const [needsOps, setNeedsOps] = useState("no"); // "yes" | "no"

  const parseMedicines = (txt) =>
    txt.split(",").map(s => s.trim()).filter(Boolean);

  const onSubmit = (e) => {
    e.preventDefault();
    const meds = needsMeds === "yes" ? parseMedicines(medicineText) : [];
    const tx   = needsTx   === "yes" ? parseMedicines(treatmentsText) : [];
    const ops  = needsOps  === "yes" ? parseMedicines(operationsText) : [];

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

    createDiagnosis.mutate(
      { title: title.trim(), description: description.trim(), medicine: meds, treatment: tx, operation: ops},
      {
        onSuccess: () => navigate(`/diagnosis/patient/${patientId}`, { replace: true }),
      }
    );
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <Link
            to={`/diagnosis/patient/${patientId}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("diagnoses.create.back")}
          </Link>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="mb-6 text-3xl font-semibold tracking-tight text-slate-950">{t("diagnoses.create.title")}</h1>

          <form onSubmit={onSubmit} className="space-y-4" aria-busy={createDiagnosis.isPending}>
            <Input
              label={t("diagnoses.form.titleLabel")}
              id="diagnosis-title"
              name="diagnosis-title"
              placeholder={t("diagnoses.form.titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />

            <div>
              <label htmlFor="diagnosis-description" className="mb-1.5 block text-sm font-semibold text-slate-700">{t("diagnoses.form.descriptionLabel")}</label>
              <textarea
                id="diagnosis-description"
                rows={4}
                className="w-full min-h-11 rounded-xl border border-slate-300 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={t("diagnoses.form.descriptionPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

           {/* Toggle + campo condicional para medicinas */}
           {/* Medications (misma ui que Patients) */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
               {t("diagnoses.form.requiresMeds")}
            </label>
            <div className="flex gap-2 mb-2" role="group" aria-label= {t("diagnoses.form.requiresMeds")}>
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

           {/* Treatments (igual ui que medicines) */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">
             {t("diagnoses.form.requiresTx")}
          </label>
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

        {/* Operations (igual ui que medicines/treatments) */}
  <div>
    <label className="mb-1.5 block text-sm font-semibold text-slate-700">
       {t("diagnoses.form.requiresOps")}
    </label>
    <div className="flex gap-2 mb-2" role="group" aria-label={t("diagnoses.form.requiresOps")}>
      <ToggleButton active={needsOps === "yes"} onClick={() => setNeedsOps("yes")}> {t("diagnoses.form.yes")}</ToggleButton>
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

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="submit" disabled={ !title || (needsMeds === "yes" && medicineText.trim() === "") ||
              (needsTx   === "yes" && treatmentsText.trim() === "") 
              || (needsOps  === "yes" && operationsText.trim() === "") || !description || createDiagnosis.isPending} 
            loading={createDiagnosis.isPending}>
              {createDiagnosis.isPending ? t("diagnoses.create.creating") : t("diagnoses.create.submit")}
            </Button>
          </div>
        </form>
      </section>
      </div>
    </main>
  );
}
