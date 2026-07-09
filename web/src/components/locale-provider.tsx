"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { t, type Locale } from "@/lib/i18n";

const KEY = "pxvault_locale";
const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  tr: (key: string) => string;
}>({
  locale: "en",
  setLocale: () => undefined,
  tr: (key) => key
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Locale | null) ?? "en";
    setLocale(stored === "ar" ? "ar" : "en");
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY, locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      tr: (key: string) => t(locale, key)
    }),
    [locale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
