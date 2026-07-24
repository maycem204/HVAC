import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "./locales/fr.json";
import en from "./locales/en.json";

export const LANGUAGE_STORAGE_KEY = "quoteai_interface_language";
export type InterfaceLanguage = "fr" | "en";

function initialLanguage(): InterfaceLanguage {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved === "fr" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: initialLanguage(),
  fallbackLng: "fr",
  supportedLngs: ["fr", "en"],
  keySeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on("languageChanged", (language) => {
  if (language === "fr" || language === "en") {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }
});

document.documentElement.lang = i18n.resolvedLanguage === "en" ? "en" : "fr";

export default i18n;
