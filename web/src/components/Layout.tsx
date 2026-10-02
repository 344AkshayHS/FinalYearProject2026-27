import { Link, Outlet } from 'react-router-dom';

import { useApp } from '~/lib/app-context';

// The top bar (name, language switch, profile) around every page a logged-in farmer sees
export function Layout() {
  const { t, language, setLanguage } = useApp();

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand">
            🌱 {t.appName}
          </Link>
          <nav className="header-links">
            {/* One click switches every page between English and Kannada */}
            <button type="button" className="link-button" onClick={() => setLanguage(language === 'en' ? 'kn' : 'en')} aria-label={t.switchLanguage}>
              {t.otherLanguage}
            </button>
            <Link to="/profile">{t.profile}</Link>
          </nav>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
