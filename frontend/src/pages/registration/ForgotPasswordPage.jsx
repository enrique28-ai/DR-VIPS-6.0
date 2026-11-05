import { useEffect, useRef, useState } from "react";
import { Mail } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore.js";
import AuthShell from "../../components/forms/AuthShell.jsx";
import Input from "../../components/forms/Input.jsx";
import Button from "../../components/forms/Button.jsx";
import { useTranslation } from "react-i18next";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef([]);

  const { isLoading, forgotPassword, verifyResetCode } = useAuthStore();
  const resetCodeIntro = t("auth.forgot.codeIntro", { defaultValue: "Enter the 6-digit code we sent to your email." });
  const resetCodeDigitLabel = t("auth.forgot.codeDigit", { defaultValue: "Reset code digit" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    await forgotPassword(email);
    setSent(true);
    setCode(["", "", "", "", "", ""]);
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  };

  const handleChange = (i, value) => {
    const next = [...code];
    if (value.length > 1) {
      const pasted = value.slice(0, 6).split("");
      for (let k = 0; k < 6; k++) next[k] = pasted[k] || "";
      setCode(next);
      const last = next.findLastIndex((d) => d !== "");
      inputRefs.current[Math.min(last + 1, 5)]?.focus();
    } else {
      next[i] = value;
      setCode(next);
      if (value && i < 5) inputRefs.current[i + 1]?.focus();
    }
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !code[i] && i > 0) inputRefs.current[i - 1]?.focus();
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    const verificationCode = code.join("");
    if (verificationCode.length !== 6) return;

    try {
      const data = await verifyResetCode(email, verificationCode);
      navigate(`/reset-password/${data.token}`);
    } catch {}
  };

  useEffect(() => {
    if (sent && code.every((d) => d !== "")) handleVerify(new Event("submit"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, sent]);

  return (
    <AuthShell title={t("auth.forgot.title")}>
      {!sent ? (
        <form onSubmit={handleSubmit} aria-busy={isLoading}>
          <p className="text-slate-600 mb-6 text-center">{t("auth.forgot.intro")}</p>

          <Input
            label={t("auth.forgot.emailLabel")}
            icon={Mail}
            type="email"
            placeholder={t("auth.forgot.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Button type="submit" className="cursor-pointer" loading={isLoading}>
            {t("auth.forgot.button")}
          </Button>

          <p className="mt-4 text-center text-sm text-slate-600">
            {t("auth.forgot.remember")}{" "}
            <Link to="/login" className="text-blue-600 hover:underline">
              {t("auth.forgot.backToLogin")}
            </Link>
          </p>
        </form>
      ) : (
        <div>
          <p className="text-center text-slate-700 mb-4">
            {t("auth.forgot.sentTitle1")} <span className="font-medium">{email}</span>, {t("auth.forgot.sentTitle2")}
          </p>

          <p className="text-center text-slate-600 mb-6">
            {resetCodeIntro}
          </p>

          <form onSubmit={handleVerify} className="space-y-6" aria-busy={isLoading}>
            <fieldset className="flex justify-between gap-2">
              <legend className="sr-only">
                {t("auth.forgot.codeLegend", { defaultValue: "Reset code" })}
              </legend>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (inputRefs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : undefined}
                  aria-label={`${resetCodeDigitLabel} ${i + 1}`}
                  maxLength={6}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="h-12 w-12 rounded-lg border border-slate-300 bg-slate-50 text-center text-2xl font-bold text-slate-900 shadow-sm transition-colors
                             hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              ))}
            </fieldset>

            <div className="flex gap-3">
              <Button type="submit" className="cursor-pointer" loading={isLoading}>
                {t("auth.forgot.verifyBtn", { defaultValue: "Continue" })}
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  await forgotPassword(email);
                  setCode(["", "", "", "", "", ""]);
                  setTimeout(() => inputRefs.current[0]?.focus(), 50);
                }}
                className="flex-1 cursor-pointer"
              >
                {t("auth.forgot.resendLink", { defaultValue: "Resend code" })}
              </Button>
            </div>
          </form>
        </div>
      )}
    </AuthShell>
  );
}
