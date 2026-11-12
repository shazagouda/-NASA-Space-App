import { signal, useSig } from '../signals';

export type Lang = 'en' | 'ar';
export type Theme = 'dark' | 'light';

const LS_LANG = 'tt-lang';
const LS_THEME = 'tt-theme';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, v: string): void {
  try { localStorage.setItem(key, v); } catch { /* storage unavailable: choice lasts for this session only */ }
}

/** Language + colour theme. Both are remembered and applied to <html> (lang, dir, data-theme). */
export class I18nService {
  readonly lang = signal<Lang>('en');
  readonly theme = signal<Theme>('dark');

  constructor() {
    const l = read(LS_LANG);
    const th = read(LS_THEME);
    this.lang.set(l === 'ar' ? 'ar' : 'en');
    if (th === 'light' || th === 'dark') this.theme.set(th);
    else if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches) this.theme.set('light');
    this.apply();
  }

  setLang(l: Lang): void { this.lang.set(l); write(LS_LANG, l); this.apply(); }
  setTheme(t: Theme): void { this.theme.set(t); write(LS_THEME, t); this.apply(); }

  private apply(): void {
    const root = document.documentElement;
    const l = this.lang();
    root.lang = l;
    root.dir = l === 'ar' ? 'rtl' : 'ltr';
    root.dataset.theme = this.theme();
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', this.theme() === 'light' ? '#f3f6fb' : '#050812');
  }

  /** Pick the text for the active language. */
  t(en: string, ar: string): string { return this.lang() === 'ar' ? ar : en; }
}

export const i18n = new I18nService();

/** React hook: re-renders the component when the language changes and returns the picker. */
export function useT(): (en: string, ar: string) => string {
  const lang = useSig(() => i18n.lang());
  return (en, ar) => (lang === 'ar' ? ar : en);
}
