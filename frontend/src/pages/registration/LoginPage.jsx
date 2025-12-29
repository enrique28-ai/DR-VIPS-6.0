import { useState, useRef } from "react";
import { Mail, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore.js";
import AuthShell from "../../components/forms/AuthShell.jsx";
import Input from "../../components/forms/Input.jsx";
import Button from "../../components/forms/Button.jsx";
import ReCAPTCHA from "react-google-recaptcha";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";

const GoogleIcon = (props) => (
  <svg viewBox="0 0 533.5 544.3" aria-hidden="true" {...props}>
    <path fill="#4285F4" d="M533.5 278.4c0-18.5-1.6-37-5-54.9H272.1v104h147c-6.1 33-25 60.8-53.2 79.4l86.1 66.8c50.2-46.3 81.5-114.6 81.5-195.3z"/>
    <path fill="#34A853" d="M272.1 544.3c72.7 0 133.8-24 178.4-65.3l-86.1-66.8c-23.9 16.1-54.6 25.5-92.3 25.5-70.8 0-130.8-47.7-152.4-111.9l-90 69.6c41 81.9 125.2 148.9 242.4 148.9z"/>
    <path fill="#FBBC05" d="M119.7 325.8c-10.1-30-10.1-62.4 0-92.4l-90-69.6C6.3 204.1 0 236.7 0 272.2s6.3 68.1 29.7 108.4l90-54.8z"/>
    <path fill="#EA4335" d="M272.1 107.7c39.5-.6 77.2 15.1 105.8 42.9l79.1-79.1C408.4 23.2 343.6 0 272.1 0 154.9 0 70.7 67 29.7 148.9l90 69.6c21.6-64.2 81.6-110.8 152.4-110.8z"/>
  </svg>
);



export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, isLoading, googleStart } = useAuthStore();
  const RECAPTCHA_SITE_KEY = "6LeuCt4rAAAAAMmxLbdnWGKp8XpfVJRMWSdjU4k_"; // pega aquí la site key
  const recaptchaRef = useRef(null);
  const [captcha, setCaptcha] = useState("");


 
  const handleLogin = async (e) => {
    e.preventDefault();
     if (!captcha) return toast.error(t("auth.login.errors.captcha"));

  try {
    await login(email, password, captcha);   // si falla, salta al catch
    // si quieres, aquí pones navigate(...) u otra acción post-login
  } catch {
    // si el backend rechazó el captcha u otro error:
    try { recaptchaRef.current?.reset(); setCaptcha(""); } catch {}
   }
  };

  return (
    <AuthShell title={t("auth.login.title")}>
      <form onSubmit={handleLogin}>
        <Input
          label={t("auth.login.emailLabel")}
          icon={Mail}
          type="email"
          placeholder={t("auth.login.emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Input
          label={t("auth.login.passwordLabel")}
          icon={Lock}
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {/* 🔗 Forgot password link */}
        <div className="mb-4 -mt-3 text-right">
          <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">
             {t("auth.login.forgotLink")}
          </Link>
        </div>

        <div className="mt-3 mb-6 flex justify-center">
          <div className="inline-block">
         <ReCAPTCHA
          key={i18n.language} 
          hl={i18n.language}
           ref={recaptchaRef}
           sitekey={RECAPTCHA_SITE_KEY}
           onChange={(token) => setCaptcha(token || "")}
         />
         </div>
       </div>

        <Button type="submit" className="cursor-pointer" loading={isLoading} disabled={!captcha || isLoading}> {t("auth.login.button")}</Button>
        

    {/* —— OR —— */}
        <div className="my-4 flex items-center gap-3">
          <span className="h-px w-full bg-gray-200" />
          <span className="text-xs uppercase tracking-widest text-gray-500"> {t("auth.login.divider")}</span>
          <span className="h-px w-full bg-gray-200" />
        </div>

        {/* Google button estilo ejemplo */}
        <button
          type="button"
          onClick={async () => {
            if (!captcha) { toast.error(t("auth.login.errors.captcha")); return; }
            await useAuthStore.getState().googleStart(captcha);
          }}
          aria-label={t("auth.login.google")}
          className="cursor-pointer w-full inline-flex items-center justify-center gap-3 rounded-md border border-gray-300 bg-white py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
        >
          <GoogleIcon className="h-5 w-5" />
          <span>{t("auth.login.google")}</span>
        </button>

        <p className="mt-4 text-center text-sm text-gray-600">
           {t("auth.login.noAccount")}{" "}
          <Link to="/signup" className="text-blue-600 hover:underline">{t("auth.login.registerLink")}</Link>
        </p>
      </form>
    </AuthShell>
  );
}
