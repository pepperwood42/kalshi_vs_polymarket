export type Locale = "en" | "ru";

export const LOCALE_STORAGE_KEY = "prediction-dashboard-locale";

export function getIntlLocale(locale: Locale) {
  return locale === "ru" ? "ru-RU" : "en-US";
}

export function getInitialLocale(): Locale {
  try {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);

    if (storedLocale === "en" || storedLocale === "ru") {
      return storedLocale;
    }
  } catch (_error) {}

  return navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
}
