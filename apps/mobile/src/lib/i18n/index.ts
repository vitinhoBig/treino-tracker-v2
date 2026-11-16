import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import ptBR from './pt-BR.json';

// pt-BR voice: address the user as "você", friendly and direct, never "tu"
// Use the imperative for buttons ("Entrar", "Criar conta"), and keep error messages calm.

export const SUPPORTED_LANGUAGES = ['en', 'pt-BR'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const resources = {
  en: { translation: en },
  'pt-BR': { translation: ptBR },
} as const;

// Maps the base language of a device locale to the language the app ships. There is only one
// Portuguese, so "pt-PT" gets pt-BR rather than English.
const LANGUAGE_BY_BASE: Record<string, Language> = { en: 'en', pt: 'pt-BR' };

/**
 * Picks the app language from the device's preferred locales, in order, such as ["fr-FR", "pt-BR"].
 * The first one the app supports wins, and English is the fallback.
 */
export function pickLanguage(preferredTags: readonly string[]): Language {
  for (const tag of preferredTags) {
    const language = LANGUAGE_BY_BASE[tag.toLowerCase().split(/[-_]/)[0]];
    if (language) return language;
  }
  return 'en';
}

// The app's own instance, not i18next's shared default, so nothing else can change its settings.
const i18n = createInstance();

// initAsync: false makes init finish before the next line, which is possible because the
// translations are bundled and not fetched. Screens can call t() on their first render.
void i18n.use(initReactI18next).init({
  resources,
  lng: pickLanguage(getLocales().map((locale) => locale.languageTag)),
  fallbackLng: 'en',
  // React Native text isn't HTML, and React escapes what it renders anyway.
  interpolation: { escapeValue: false },
  initAsync: false,
});

// Makes t('hello.title') type-checked against en.json, so a mistyped key fails typecheck.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}

export default i18n;
