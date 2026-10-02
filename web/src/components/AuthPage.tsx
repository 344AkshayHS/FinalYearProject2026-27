import type { ReactNode } from 'react';

import { useApp } from '~/lib/app-context';
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

// Shared look of the login and register pages: green header, logo, and a white form box
export function AuthPage({ children }: { children: ReactNode }) {
  const { t } = useApp();

  return (
    <div className="auth-page">
      <div className="auth-top">
        <div className="auth-logo">🌱</div>
        <h1>{t.appName}</h1>
        <p>{t.tagline}</p>
      </div>
      <div className="auth-box">{children}</div>
      <LanguageSwitch />
    </div>
  );
}
