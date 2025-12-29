import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore.js";
import AuthShell from "../../components/forms/AuthShell.jsx";
import Button from "../../components/forms/Button.jsx";
import { useTranslation } from "react-i18next";


export default function EmailVerificationPage() {
  const { t } = useTranslation();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef([]);
  const navigate = useNavigate();
  const { isLoading, verifyEmail, resendCode, user } = useAuthStore();

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const verificationCode = code.join("");
    try {
      await verifyEmail(verificationCode);
      const role = user?.role || "doctor";
      navigate(role === "patient" ? "/docrecords/myhealthstate" : "/patients");
    } catch {}
  };

  useEffect(() => {
    if (code.every((d) => d !== "")) handleSubmit(new Event("submit"));
  }, [code]);

  return (
    <AuthShell title={t("auth.verify.title")}>
      <p className="text-center text-gray-600 mb-6">
        {t("auth.verify.intro")}
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex justify-between">
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => (inputRefs.current[i] = el)}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-12 h-12 text-center text-2xl font-bold bg-white text-gray-900
                         border border-gray-300 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          ))}
        </div>


        <div className="flex gap-3">
          <Button type="submit" className="cursor-pointer" loading={isLoading}>{t("auth.verify.button")}</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => resendCode()}
            className="flex-1 cursor-pointer"
          >
            {t("auth.verify.resend")}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
