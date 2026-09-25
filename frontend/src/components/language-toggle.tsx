import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { SUPPORTED_LANGUAGES, setLanguage, type SupportedLanguage } from "@/lib/i18n";

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const current = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as SupportedLanguage)
    : "en";

  const toggle = () => {
    const next = current === "en" ? "es" : "en";
    setLanguage(next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Switch language / Cambiar idioma"
    >
      <span className="text-xs font-semibold uppercase">{current === "en" ? "ES" : "EN"}</span>
    </Button>
  );
}
