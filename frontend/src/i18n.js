import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locals/en/common.json";
import es from "./locals/es/common.json";
//import fr from "./locals/fr/common.json";

const savedLang =
  typeof window !== "undefined" ? localStorage.getItem("lang") || "en" : "en";

i18n
  .use(initReactI18next)
  .init({
    lng: savedLang,
    fallbackLng: "en",
    resources: {
      en: { translation: en },
      es: { translation: es },
      //fr: { translation: fr },
    },
    interpolation: { escapeValue: false },
  });

export default i18n;

