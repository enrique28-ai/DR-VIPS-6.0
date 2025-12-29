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

  if (!pending) return null;

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 text-center">
          {pending.picture && (
            <img src={pending.picture} alt="" className="mx-auto mb-2 h-14 w-14 rounded-full" />
          )}
          <h1 className="text-xl font-semibold">{t("auth.chooseRole.title")}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {t("auth.chooseRole.newAccount")}: <b>{pending.email}</b>
          </p>
        </div>

        {err && (
          <div className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{err}</div>
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
            className={!pending.allowDoctor ? "opacity-60 cursor-not-allowed" : ""}
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
            <p className="text-xs text-gray-500">
              {t("auth.chooseRole.doctorNotAllowed")}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
