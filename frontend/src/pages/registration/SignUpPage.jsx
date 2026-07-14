import { useState, useEffect, useRef } from "react";
import { User, Mail, Lock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore.js";
import AuthShell from "../../components/forms/AuthShell.jsx";
import Input from "../../components/forms/Input.jsx";
import PasswordStrengthMeter from "../../components/forms/PasswordStrengthMeter.jsx";
import { toast } from "react-hot-toast";
import Button from "../../components/forms/Button.jsx";
import { isStrongPassword } from "../../lib/password.js";
import ReCAPTCHA from "react-google-recaptcha";
import { useTranslation } from "react-i18next";


const GoogleIcon = (props) => (
  <svg viewBox="0 0 533.5 544.3" aria-hidden="true" {...props}>
    <path fill="#4285F4" d="M533.5 278.4c0-18.5-1.6-37-5-54.9H272.1v104h147c-6.1 33-25 60.8-53.2 79.4l86.1 66.8c50.2-46.3 81.5-114.6 81.5-195.3z"/>
    <path fill="#34A853" d="M272.1 544.3c72.7 0 133.8-24 178.4-65.3l-86.1-66.8c-23.9 16.1-54.6 25.5-92.3 25.5-70.8 0-130.8-47.7-152.4-111.9l-90 69.6c41 81.9 125.2 148.9 242.4 148.9z"/>
    <path fill="#FBBC05" d="M119.7 325.8c-10.1-30-10.1-62.4 0-92.4l-90-69.6C6.3 204.1 0 236.7 0 272.2s6.3 68.1 29.7 108.4l90-54.8z"/>
    <path fill="#EA4335" d="M272.1 107.7c39.5-.6 77.2 15.1 105.8 42.9l79.1-79.1C408.4 23.2 343.6 0 272.1 0 154.9 0 70.7 67 29.7 148.9l90 69.6c21.6-64.2 81.6-110.8 152.4-110.8z"/>
  </svg>
);

const CAPTCHA_ENABLED = import.meta.env.VITE_CAPTCHA_ENABLED === "true";


export default function SignUpPage() {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { signup, isLoading, googleStart } = useAuthStore();
  const strong = isStrongPassword(password);
  const navigate = useNavigate();
  const RECAPTCHA_SITE_KEY = "6LeuCt4rAAAAAMmxLbdnWGKp8XpfVJRMWSdjU4k_"; // pega aquí la site key
  const recaptchaRef = useRef(null);
  const [captcha, setCaptcha] = useState("");
  const [role, setRole] = useState("doctor");
  const [isDesktopCaptcha, setIsDesktopCaptcha] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(min-width: 640px)").matches
      : true,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const query = window.matchMedia("(min-width: 640px)");
    const handleChange = (event) => setIsDesktopCaptcha(event.matches);

    setIsDesktopCaptcha(query.matches);
    query.addEventListener?.("change", handleChange);

    return () => query.removeEventListener?.("change", handleChange);
  }, []);



  useEffect(() => {
  // Evita que el navegador restaure el scroll cuando vuelves con la flecha (bfcache)
  const prev = window.history.scrollRestoration;
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }

  const toTop = () => {
    // reflow -> sube; así el card vuelve a quedar centrado
    requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  };

  // al entrar a la pantalla
  toTop();

  // si regresas desde Google con la flecha (bfcache)
  const onShow = (e) => { if (e.persisted) toTop(); };
  window.addEventListener("pageshow", onShow);

  // si el tab vuelve a estar visible
  const onVisible = () => { if (document.visibilityState === "visible") toTop(); };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    window.removeEventListener("pageshow", onShow);
    document.removeEventListener("visibilitychange", onVisible);
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = prev;
    }
  };
}, []);
 

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!strong) return toast.error(t("auth.signup.errors.weakPassword"));
    if (CAPTCHA_ENABLED && !captcha) return toast.error(t("auth.signup.errors.captcha"));
    try {
      await signup(name, email, password, CAPTCHA_ENABLED ? captcha : undefined, role)
      navigate("/verify-email");
    } catch {
      try { recaptchaRef.current?.reset(); setCaptcha(""); } catch {}
    }
  };

  return (
    <AuthShell title={t("auth.signup.title")}>
      <form onSubmit={handleSignUp}>
        <Input label={t("auth.signup.usernameLabel")} icon={User} type="text" placeholder={t("auth.signup.usernamePlaceholder")}
               value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label={t("auth.signup.emailLabel")} icon={Mail} type="email" placeholder={t("auth.signup.emailPlaceholder")}
               value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label={t("auth.signup.passwordLabel")} icon={Lock} type="password" placeholder="••••••••"
               value={password} onChange={(e) => setPassword(e.target.value)} required />

        <p className="text-xs text-slate-500 -mt-3 mb-2">{t("auth.signup.passwordHint")}</p>
        <PasswordStrengthMeter password={password} />


        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-semibold text-slate-700">
            {t("auth.signup.roleQuestion")}
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors duration-150 ${role==="doctor"?"border-blue-600 bg-blue-50 text-blue-700":"border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"}`}>
              <input
                type="radio"
                name="role"
                value="doctor"
                className="h-4 w-4 border-slate-300 text-blue-600 accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                checked={role==="doctor"}
                onChange={()=>setRole("doctor")}
              />
              <span>{t("auth.signup.roleDoctor")}</span>
            </label>
            <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors duration-150 ${role==="patient"?"border-blue-600 bg-blue-50 text-blue-700":"border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"}`}>
              <input
                type="radio"
                name="role"
                value="patient"
                className="h-4 w-4 border-slate-300 text-blue-600 accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                checked={role==="patient"}
                onChange={()=>setRole("patient")}
              />
              <span>{t("auth.signup.rolePatient")}</span>
            </label>
          </div>
        </fieldset>

        {CAPTCHA_ENABLED && (
          <div className="mt-3 flex w-full justify-center">
           <ReCAPTCHA
            key={`${i18n.language}-${isDesktopCaptcha ? "normal" : "compact"}`}
            hl={i18n.language}
             size={isDesktopCaptcha ? "normal" : "compact"}
             ref={recaptchaRef}
             sitekey={RECAPTCHA_SITE_KEY}
             onChange={(token) => setCaptcha(token || "")}
           />
         </div>
        )}

        <Button className="mt-4 cursor-pointer" type="submit" loading={isLoading} disabled={!strong || isLoading || (CAPTCHA_ENABLED && !captcha)}>{t("auth.signup.button")}</Button>

        <div className="my-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            {t("auth.signup.divider")}
          </span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <button
          type="button"
          onClick={async () => {
            if (CAPTCHA_ENABLED && !captcha) { toast.error(t("auth.signup.errors.captcha")); return; }
            await googleStart(CAPTCHA_ENABLED ? captcha : undefined);
          }}
          aria-label={t("auth.signup.google")}
          className="cursor-pointer w-full inline-flex min-h-11 items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:bg-slate-100"
        >
          <GoogleIcon className="h-5 w-5" />
          <span>{t("auth.signup.google")}</span>
        </button>

        <p className="mt-4 text-center text-sm text-slate-600">
          {t("auth.signup.haveAccount")}{" "}
          <Link to="/login" className="text-blue-600 hover:underline"> {t("auth.signup.loginLink")}</Link>
        </p>
      </form>
    </AuthShell>
  );
}
