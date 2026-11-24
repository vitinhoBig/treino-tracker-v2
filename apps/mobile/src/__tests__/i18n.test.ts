import en from '@/lib/i18n/en.json';
import ptBR from '@/lib/i18n/pt-BR.json';
import { pickLanguage } from '@/lib/i18n';

type Tree = { [key: string]: string | Tree };

/** Turns {a: {b: "x"}} into {"a.b": "x"}, so two languages can be compared key by key. */
function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((flat, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? { ...flat, [path]: value } : { ...flat, ...flatten(value, path) };
  }, {});
}

const placeholders = (text: string) => [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

const english = flatten(en);
const portuguese = flatten(ptBR);

describe('translation files', () => {
  it('have the same keys in both languages', () => {
    expect(Object.keys(portuguese).sort()).toEqual(Object.keys(english).sort());
  });

  it('use the same {{placeholders}} in both languages for every key', () => {
    for (const key of Object.keys(english)) {
      expect({ key, placeholders: placeholders(portuguese[key] ?? '') }).toEqual({
        key,
        placeholders: placeholders(english[key]),
      });
    }
  });

  // The voice rule in src/lib/i18n/index.ts: "você", never "tu". This catches the common "tu"
  // words and verb forms. It can't judge wording, which is for a person to review.
  it('address the user as "você" in Portuguese, never with "tu" forms', () => {
    const tuForms = /\b(tu|teu|tua|teus|tuas|contigo|tens|queres|podes|estás|entra|digita|confirma|tenta)\b/i;
    for (const [key, value] of Object.entries(portuguese)) {
      expect({ key, tuForm: tuForms.exec(value)?.[0] ?? null }).toEqual({ key, tuForm: null });
    }
  });

  it('have no empty strings', () => {
    for (const [key, value] of [...Object.entries(english), ...Object.entries(portuguese)]) {
      expect({ key, empty: value.trim() === '' }).toEqual({ key, empty: false });
    }
  });
});

describe('pickLanguage', () => {
  it('uses the first preferred language the app supports', () => {
    expect(pickLanguage(['en-US', 'pt-BR'])).toBe('en');
    expect(pickLanguage(['pt-BR', 'en-US'])).toBe('pt-BR');
  });

  it('skips languages the app does not have', () => {
    expect(pickLanguage(['fr-FR', 'pt-BR'])).toBe('pt-BR');
  });

  it('gives any Portuguese the Brazilian one, since it is the only one shipped', () => {
    expect(pickLanguage(['pt-PT'])).toBe('pt-BR');
    expect(pickLanguage(['pt'])).toBe('pt-BR');
  });

  it('accepts underscores and any letter case', () => {
    expect(pickLanguage(['PT_br'])).toBe('pt-BR');
    expect(pickLanguage(['EN'])).toBe('en');
  });

  it('falls back to English', () => {
    expect(pickLanguage([])).toBe('en');
    expect(pickLanguage(['es-ES', 'de-DE'])).toBe('en');
    expect(pickLanguage([''])).toBe('en');
  });
});
