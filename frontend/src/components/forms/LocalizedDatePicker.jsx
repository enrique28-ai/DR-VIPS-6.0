// src/components/forms/LocalizedDatePicker.jsx
import React from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import { enUS, es } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import "react-datepicker/dist/react-datepicker.css";

// Registramos los locales una vez
registerLocale("en", enUS);
registerLocale("es", es);

export default function LocalizedDatePicker({
  value,        // string: "YYYY-MM-DD" o ""
  onChange,     // (newValue: string) => void
  className,
  placeholder,  // texto del placeholder (opcional)
  ...rest
}) {
  const { i18n } = useTranslation();

  // idioma actual de i18next → locale del datepicker
  const locale = i18n.language?.startsWith("es") ? "es" : "en";

  const selectedDate = value ? new Date(value) : null;

  // placeholder por defecto, por si no mandas ninguno
  const fallbackPlaceholder =
    locale === "es" ? "Selecciona una fecha" : "Select a date";

  return (
    <DatePicker
      selected={selectedDate}
      onChange={(date) => {
        const iso = date ? date.toISOString().slice(0, 10) : "";
        onChange?.(iso);
      }}
      locale={locale}
      dateFormat="yyyy-MM-dd"
      isClearable
      // 🔹 aquí es donde evitamos el “buscador en blanco”
      placeholderText={placeholder || fallbackPlaceholder}
      // 🔹 mismos estilos que tu input anterior
      className={
        className ??
        "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 outline-none focus:ring-2 focus:ring-blue-500"
      }
      {...rest}
    />
  );
}
