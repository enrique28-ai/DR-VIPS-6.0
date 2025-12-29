import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("lang", lang);
  };

  return (
    <select
      value={i18n.language}
      onChange={(e) => changeLanguage(e.target.value)}
      className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-gray-800"
      aria-label="Select language"
    >
      <option value="en">EN</option>
      <option value="es">ES</option>
    </select>
  );
}
