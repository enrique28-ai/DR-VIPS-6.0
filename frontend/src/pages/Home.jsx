// src/pages/Home.jsx
import { Link } from "react-router-dom";
import { useAuthStore } from "../stores/authStore.js";
import { useTranslation } from "react-i18next";

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

  // Usamos llaves de i18n, NO textos duros
  const ctaKey = !authReady
    ? "home.cta.checking"
    : isAuthenticated
    ? role === "patient"
      ? "home.cta.patient"
      : "home.cta.doctor"
    : "home.cta.signIn";

  const ctaText = t(ctaKey);

  // Descripción según rol
  const descriptionKey = !isAuthenticated
    ? "home.description.general"
    : role === "patient"
      ? "home.description.patient"
      : "home.description.doctor";

  return (
    <main className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center overflow-hidden">
      {/* Fondo con degradado suave */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-emerald-50 via-white to-white"
      />

      <section className="w-full max-w-4xl rounded-3xl border border-gray-200 bg-white/70 backdrop-blur p-8 md:p-12 shadow-sm">
        <div className="flex flex-col md:flex-row items-center gap-8">
          {/* Izquierda: copy */}
          <div className="flex-1">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {t("home.title")}
            </h1>

            {/* Slogan */}
            <span className="mt-2 inline-block rounded-full bg-blue-50 px-3 py-1 text-blue-700 text-sm font-semibold">
              {t("home.tagline")}
            </span>

            <p className="mt-3 text-gray-600 leading-relaxed">
              {t(descriptionKey)}
            </p>

            <div className="mt-6">
              <Link
                to={targetHref}
                onClick={(e) => {
                  if (!authReady) e.preventDefault();
                }}
                className={`inline-flex items-center gap-2 rounded-lg px-5 py-3 font-medium text-white transition
                  ${
                    !authReady
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }
                `}
                aria-disabled={!authReady}
              >
                {ctaText} <span aria-hidden>→</span>
              </Link>
            </div>

            {!isAuthenticated && authReady && (
              <p className="mt-3 text-sm text-gray-500">
                {t("home.noAccount")}{" "}
                <Link to="/signup" className="text-blue-600 hover:underline">
                  {t("home.createAccount")}
                </Link>
                .
              </p>
            )}
          </div>

          {/* Derecha: bloque ilustración simple */}
          <div className="flex-1 w-full">
            <div className="aspect-[4/3] w-full rounded-2xl border border-dashed border-gray-300 grid place-items-center">
              <div className="text-gray-500 text-center px-6">
                <div className="relative w-48 md:w-48"><img 
              src="/dr-vips-logo.png" 
              alt="DR-VIPS Logo" 
              className="relative z-10 w-full h-auto drop-shadow-2xl transform hover:scale-105 transition-duration-500 ease-in-out"
            /></div>
                <div className="font-medium">
                  {t("home.workspace.title")}
                </div>
                <div className="text-sm">
                  {t("home.workspace.subtitle")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
