// src/components/LanguageGate.jsx
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function LanguageGate({ children }) {
  const { t, i18n } = useTranslation();

  const [lang, setLang] = useState(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem("lang") || "";
  });

  const handleSelect = (code) => {
    i18n.changeLanguage(code);
    localStorage.setItem("lang", code);
    setLang(code);
  };

  if (lang) return children;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow p-8 text-center space-y-6">
        <h1 className="text-2xl font-bold">{t("languageGate.title")}</h1>
        <p className="text-gray-600 text-sm">
          {t("languageGate.description")}
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => handleSelect("en")}
            className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium hover:bg-gray-50"
          >
            English
          </button>
          <button
            onClick={() => handleSelect("es")}
            className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium hover:bg-gray-50"
          >
            Español
          </button>
        </div>
      </div>
    </div>
  );
}
