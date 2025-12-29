import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { useDiagnosis, useUpdateDiagnosis } from "../../features/diagnostics/dhooks.js";
import Input from "../../components/forms/Input.jsx";
import Button from "../../components/forms/Button.jsx";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";



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
  if (isLoading && !diag) return null;
  if (isError || !diag) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold"> {t("diagnoses.detail.notFoundTitle")}</h1>
          <div className="mt-4">
            <Button full={false} variant="secondary" onClick={() => navigate(`/diagnosis/patient/${patientId}`)}>
              {t("diagnoses.detail.backToList")}
            </Button>
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
    <main className="mx-auto max-w-2xl p-4">
      <div className="mb-4">
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100"
        >
           ← {t("diagnoses.edit.back")}
        </button>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-semibold">{t("diagnoses.edit.title")}</h1>

        <form onSubmit={onSubmit} className="space-y-4" aria-busy={updateDiagnosis.isPending}>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("diagnoses.form.titleLabel")}</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder={t("diagnoses.form.titlePlaceholder")} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("diagnoses.form.descriptionLabel")}</label>
            <textarea
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("diagnoses.form.descriptionPlaceholder")}
              required
            />
          </div>

          {/* Toggle + campo condicional para medicinas */}
          {/* Medications (misma UI que Patients) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("diagnoses.form.requiresMeds")}</label>
            <div className="flex gap-2 mb-2" role="group" aria-label={t("diagnoses.form.requiresMeds")}>
              <Button type="button" variant={needsMeds === "yes" ? "primary" : "secondary"} onClick={() => setNeedsMeds("yes")}>
                 {t("diagnoses.form.yes")}
              </Button>
              <Button type="button" variant={needsMeds === "no" ? "primary" : "secondary"} onClick={() => setNeedsMeds("no")}>
                 {t("diagnoses.form.no")}
              </Button>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("diagnoses.form.requiresTx")}</label>
          <div className="flex gap-2 mb-2" role="group" aria-label={t("diagnoses.form.requiresTx")}>
            <Button type="button" variant={needsTx === "yes" ? "primary" : "secondary"} onClick={() => setNeedsTx("yes")}>{t("diagnoses.form.yes")}</Button>
            <Button type="button" variant={needsTx === "no"  ? "primary" : "secondary"} onClick={() => setNeedsTx("no")}>{t("diagnoses.form.no")}</Button>
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
    <label className="block text-sm font-medium text-gray-700 mb-1">{t("diagnoses.form.requiresOps")}</label>
    <div className="flex gap-2 mb-2" role="group" aria-label={t("diagnoses.form.requiresOps")}>
      <Button type="button" variant={needsOps === "yes" ? "primary" : "secondary"} onClick={() => setNeedsOps("yes")}>{t("diagnoses.form.yes")}</Button>
      <Button type="button" variant={needsOps === "no"  ? "primary" : "secondary"} onClick={() => setNeedsOps("no")}> {t("diagnoses.form.no")}</Button>
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

          <div className="grid grid-cols-1 gap-2">
              <Button variant="secondary" className="w-full" onClick={handleBack}>{t("diagnoses.edit.cancel")}</Button>
            <Button type="submit" className="w-full" disabled={!title || (needsMeds === "yes" && medicineText.trim() === "") 
            || (needsTx   === "yes" && treatmentsText.trim() === "") || (needsOps  === "yes" && operationsText.trim() === "") 
            || !description || updateDiagnosis.isPending} 
            loading={updateDiagnosis.isPending}>
              {updateDiagnosis.isPending ? t("diagnoses.edit.saving") : t("diagnoses.edit.save")}
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
