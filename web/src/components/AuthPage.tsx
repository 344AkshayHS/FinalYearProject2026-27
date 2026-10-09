import type { ReactNode } from 'react';

import { useApp } from '~/lib/app-context';
import { webText } from '~/lib/web-text';
import { TEXT_SIZES } from '@/lib/text-size';
import type { Language } from '@/lib/translations';

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'kn', label: 'ಕನ್ನಡ' },
];

// Two-option switch between English and Kannada (used on the login, register and profile pages)
export function LanguageSwitch() {
  const { language, setLanguage } = useApp();

  return (
    <div className="language-switch">
      {LANGUAGES.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === language ? 'language-option language-option-selected' : 'language-option'}
          aria-pressed={option.value === language}
          onClick={() => setLanguage(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Normal, big or bigger letters for every page. Each choice shows its "A" at its own size, so the difference is
// seen before pressing; the choices themselves keep one size (they do not grow with the text).
export function TextSizeSwitch() {
  const { t, textSize, setTextSize } = useApp();

  return (
    <div className="size-switch" role="group" aria-label={t.textSize.title}>
      {TEXT_SIZES.map((size) => (
        <button
          key={size}
          type="button"
          className={size === textSize ? 'size-option size-option-selected' : 'size-option'}
          aria-pressed={size === textSize}
          onClick={() => setTextSize(size)}>
          <span className={`size-letter size-letter-${size}`} aria-hidden="true">
            A
          </span>
          <span>{t.textSize[size]}</span>
        </button>
      ))}
    </div>
  );
}

// The login and register pages: on a wide screen GreenRoot's introduction on the left (what it does, in three
// lines) and the form on the right; on a phone the introduction is a short band above the form.
export function AuthPage({ children }: { children: ReactNode }) {
  const { t, language } = useApp();

  return (
    <div className="auth-page">
      <section className="auth-intro">
        <div className="auth-logo" aria-hidden="true">
          🌱
        </div>
        <h1>{t.appName}</h1>
        <p className="auth-tagline">{t.tagline}</p>
        <ul className="auth-features">
          {webText[language].auth.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>
      <div className="auth-form-side">
        <div className="auth-box">{children}</div>
        <LanguageSwitch />
        <TextSizeSwitch />
      </div>
    </div>
  );
}
