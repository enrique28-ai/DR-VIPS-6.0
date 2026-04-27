// src/components/forms/LocalizedDatePicker.jsx
import React from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import { enUS, es } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import "react-datepicker/dist/react-datepicker.css";

// Registramos los locales
registerLocale("en", enUS);
registerLocale("es", es);

export default function LocalizedDatePicker({
  value,
  onChange,
  className,
  placeholder,
  ...rest
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("es") ? "es" : "en";

  // Función auxiliar para entender lo que llega (Date o String)
  const getSelectedDate = () => {
    if (!value) return null;
    // Si ya es objeto Date (del calendario de citas)
    if (value instanceof Date) return value;
    // Si es string YYYY-MM-DD (de diagnósticos)
    if (typeof value === "string" && value.length === 10) {
      const [year, month, day] = value.split("-").map(Number);
      return new Date(year, month - 1, day);
    }
    // Fallback
    return new Date(value);
  };

  const selectedDate = getSelectedDate();
  const fallbackPlaceholder = t("common.selectDate");

  return (
    <DatePicker
      selected={selectedDate}
      onChange={(date) => {
        if (!date) {
          // Si borran la fecha
          onChange?.(rest.showTimeSelect ? null : "");
          return;
        }

        if (rest.showTimeSelect) {
          // MODO CITAS: Devolvemos la fecha completa con hora
          onChange?.(date);
        } else {
          // MODO DIAGNÓSTICO: Devolvemos solo YYYY-MM-DD (local)
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, "0");
          const d = String(date.getDate()).padStart(2, "0");
          onChange?.(`${y}-${m}-${d}`);
        }
      }}
      locale={locale}

       // Permite saltar rápido entre meses y años
      showMonthDropdown
      showYearDropdown
      dropdownMode="select"
      scrollableYearDropdown
      yearDropdownItemNumber={120}

      // 🔥 CORRECCIÓN 1: Z-INDEX MÁXIMO
      // Esto asegura que la lista de horas no se corte ni quede debajo de nada
      popperClassName="!z-[9999]"
      
      // 🔥 CORRECCIÓN 2: FORMATO AM/PM
      // Si tiene hora activada, forzamos formato de 12 horas con AM/PM
      dateFormat={rest.showTimeSelect ? "dd/MM/yyyy h:mm aa" : "yyyy-MM-dd"}
      
      isClearable
      placeholderText={placeholder || fallbackPlaceholder}
      
      // Permitir escribir manualmente (para poner minutos exactos como 10:33)
      strictParsing={false}

      className={
        className ??
        "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 outline-none focus:ring-2 focus:ring-blue-500"
      }
      {...rest}
    />
  );
}
