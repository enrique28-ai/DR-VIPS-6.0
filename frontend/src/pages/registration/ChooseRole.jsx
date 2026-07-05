import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore.js";
import Button from "../../components/forms/Button.jsx";
import { useTranslation } from "react-i18next";


export default function ChooseRole() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { getGooglePending, finalizeGoogleRole } = useAuthStore();
  const [pending, setPending] = useState(null);
  const [err, setErr] = useState("");
  const doctorHelpId = "choose-role-doctor-disabled-help";

  useEffect(() => {
    (async () => {
      try {
        const p = await getGooglePending();
        if (!p) { nav("/login", { replace: true }); return; }
        setPending(p);
      } catch {
        nav("/login", { replace: true });
      }
    })();
  }, [nav, getGooglePending]);

  if (!pending) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center p-6">
        <div
          role="status"
          aria-live="polite"
          className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm font-medium text-slate-600 shadow-sm"
        >
          {t("auth.chooseRole.loading", { defaultValue: "Loading your Google account..." })}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md items-center p-6">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/70">
        <div className="mb-6 text-center">
          {pending.picture && (
            <img
              src={pending.picture}
              alt=""
              className="mx-auto mb-3 h-16 w-16 rounded-full object-cover ring-4 ring-slate-100"
            />
          )}
          <h1 className="text-xl font-semibold text-slate-950">{t("auth.chooseRole.title")}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {t("auth.chooseRole.newAccount")}: <b>{pending.email}</b>
          </p>
        </div>

        {err && (
          <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            {err}
          </div>
        )}

        <div className="grid gap-3">
          <Button
            onClick={async () => {
              try {
                await finalizeGoogleRole("patient");
                nav("/docrecords/myhealthstate", { replace: true });
              } catch (e) {
                setErr(e?.response?.data?.error || "Failed");
              }
            }}
          >
           {t("auth.chooseRole.continuePatient")}
          </Button>

          <Button
            variant="secondary"
            disabled={!pending.allowDoctor}
            aria-describedby={!pending.allowDoctor ? doctorHelpId : undefined}
            onClick={async () => {
              try {
                await finalizeGoogleRole("doctor");
                nav("/patients", { replace: true });
              } catch (e) {
                setErr(e?.response?.data?.error || t("auth.chooseRole.genericError"));
              }
            }}
          >
            {t("auth.chooseRole.continueDoctor")}
          </Button>

          {!pending.allowDoctor && (
            <p id={doctorHelpId} className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {t("auth.chooseRole.doctorNotAllowed")}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
