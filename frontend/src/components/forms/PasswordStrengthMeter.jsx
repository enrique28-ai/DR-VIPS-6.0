import { Check, X } from "lucide-react";
import { getScore, passwordRules } from "../../lib/password.js";
import { useTranslation } from "react-i18next";






export default function PasswordStrengthMeter({ password = "" }) {
  const { t } = useTranslation();
  const labelFor = (score) =>
  [ t("password.levels.veryWeak"), t("password.levels.weak"), t("password.levels.fair"), t("password.levels.good"), t("password.levels.strong")][Math.min(score, 4)];
  const score = getScore(password);
  const rules = passwordRules(password);
  return (
    <div className="mt-2">
      {/* Header */}
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-gray-500">{t("password.strengthLabel")}</span>
        <span className="text-xs text-gray-600">{labelFor(score)}</span>
      </div>

      {/* Barras de fuerza (azules/grises) */}
      <div className="flex gap-1 mb-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 w-1/4 rounded-full ${
              i < score ? "bg-blue-600" : "bg-gray-300"
            }`}
          />
        ))}
      </div>

      {/* Criterios (texto gris, check azul) */}
      <ul className="space-y-1">
        {[
          { key: "minLen",     label: t("password.rules.minLen") },
          { key: "hasCase",    label: t("password.rules.hasCase") },
          { key: "hasNumber",  label: t("password.rules.hasNumber") },
          { key: "hasSpecial", label: t("password.rules.hasSpecial") },
        ].map(({ key, label }) => {
          const ok = !!rules[key];
          return (
            <li key={key} className="flex items-center text-xs">
              {ok ? (
                <Check className="h-4 w-4 text-blue-600 mr-2" />
              ) : (
                <X className="h-4 w-4 text-gray-400 mr-2" />
              )}
              <span className={ok ? "text-gray-700" : "text-gray-500"}>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
