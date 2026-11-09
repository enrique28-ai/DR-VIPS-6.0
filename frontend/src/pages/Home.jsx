// src/pages/Home.jsx
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../stores/authStore.js";

export default function Home() {
  const { isCheckingAuth, isAuthenticated, user } = useAuthStore();
  const { t } = useTranslation();

  const role = user?.role;
  const authReady = !isCheckingAuth;

  const targetHref = !authReady
    ? "#"
    : isAuthenticated
      ? role === "patient"
        ? "/docrecords/myhealthstate"
        : "/patients"
      : "/login";

  const ctaKey = !authReady
    ? "home.cta.checking"
    : isAuthenticated
      ? role === "patient"
        ? "home.cta.patient"
        : "home.cta.doctor"
      : "home.cta.signIn";

  const ctaText = t(ctaKey);

  const descriptionKey = !isAuthenticated
    ? "home.description.general"
    : role === "patient"
      ? "home.description.patient"
      : "home.description.doctor";

  const ctaClasses =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50";

  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-x-hidden bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 sm:py-10 lg:px-8 lg:py-14">
      <section className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-5xl items-center">
        <div className="w-full rounded-lg border border-slate-200/80 bg-white p-5 shadow-sm sm:p-8 lg:p-10">
          <div className="grid items-center gap-8 md:grid-cols-[1.05fr_0.95fr] lg:gap-12">
            <div>
              <h1 className="text-balance text-4xl font-bold text-slate-950">
                {t("home.title")}
              </h1>

              <span className="mt-4 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-sm font-semibold text-cyan-800">
                {t("home.tagline")}
              </span>

              <p className="mt-4 max-w-xl text-pretty text-base leading-7 text-slate-600">
                {t(descriptionKey)}
              </p>

              <div className="mt-7">
                {authReady ? (
                  <Link
                    to={targetHref}
                    className={`${ctaClasses} bg-slate-950 text-white hover:bg-slate-800 active:scale-[0.99]`}
                  >
                    {ctaText} <span aria-hidden>-&gt;</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    aria-busy="true"
                    className={`${ctaClasses} cursor-not-allowed bg-slate-200 text-slate-500 shadow-none`}
                  >
                    {ctaText}
                  </button>
                )}
              </div>

              {!isAuthenticated && authReady && (
                <p className="mt-4 text-sm text-slate-500">
                  {t("home.noAccount")}{" "}
                  <Link
                    to="/signup"
                    className="font-medium text-cyan-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
                  >
                    {t("home.createAccount")}
                  </Link>
                  .
                </p>
              )}
            </div>

            <div className="w-full">
              <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-950 p-6 shadow-inner sm:p-8">
                <div className="relative grid min-h-64 place-items-center rounded-lg border border-white/10 bg-white/[0.04] px-6 py-8 text-center">
                  <img
                    src="/dr-vips-logo.png"
                    alt=""
                    className="w-40 max-w-full drop-shadow-2xl sm:w-48"
                  />
                  <div className="mt-6">
                    <h2 className="font-semibold text-white">
                      {t("home.workspace.title")}
                    </h2>
                    <div className="mt-1 text-sm leading-6 text-slate-300">
                      {t("home.workspace.subtitle")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
