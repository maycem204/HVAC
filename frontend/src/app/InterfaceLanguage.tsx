import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { InterfaceLanguage } from "../i18n";

export type { InterfaceLanguage };

export function useInterfaceLanguage() {
  const { i18n, t } = useTranslation();
  const language: InterfaceLanguage = i18n.resolvedLanguage === "en" ? "en" : "fr";

  return {
    language,
    setLanguage: (nextLanguage: InterfaceLanguage) => {
      void i18n.changeLanguage(nextLanguage);
    },
    text: t,
  };
}

export function InterfaceLanguageSelector() {
  const { language, setLanguage, text:t } = useInterfaceLanguage();
  return (
    <div className="fixed bottom-4 left-4 z-[2000] flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur" aria-label={t("interface.interface.language")}>
      <Languages className="mx-1 h-4 w-4 text-slate-500"/>
      {(["fr","en"] as const).map((option)=>(
        <button key={option} type="button" onClick={()=>setLanguage(option)} aria-pressed={language===option} className={`h-8 rounded-lg px-3 text-xs font-bold transition-colors ${language===option?"bg-primary text-white":"text-slate-600 hover:bg-slate-100"}`}>
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
