import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import es from "./locales/es/translation.json";
import ca from "./locales/ca/translation.json";
import val from "./locales/val/translation.json";
import gl from "./locales/gal/translation.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      ca: { translation: ca },
      val: { translation: val },
      gl: { translation: gl },
    },
    supportedLngs: ["es", "ca", "val", "gl"],
    fallbackLng: {
      val: ["ca", "es"],
      ca: ["es"],
      gl: ["es"],
      default: ["es"],
    },
    defaultNS: "translation",
    ns: ["translation"],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;