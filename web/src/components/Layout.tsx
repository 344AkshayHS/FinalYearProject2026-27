// The frame around every page a logged-in farmer sees: the site's top bar (logo, the main pages, the language and
// the farmer's own menu) and the footer. On a narrow screen the pages fold into a "Menu" button.
//
// Home, the crop helper and the profile stay open while the farmer moves between pages; the others are only
// hidden. So a result on Home, or a chat, is still there when they come back. The other pages show in <Outlet />.

import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import { Avatar } from '~/components/ui';
import { useApp } from '~/lib/app-context';
import { webText } from '~/lib/web-text';
import { Chat } from '~/pages/Chat';
import { Home } from '~/pages/Home';
import { Profile } from '~/pages/Profile';

const KEPT_OPEN = ['/', '/chat', '/profile'];

// The site's logo: a seedling on a green square
export function Brand() {
  const { t } = useApp();
  return (
    <Link to="/" className="brand">
      <span className="brand-mark" aria-hidden="true">
        🌱
      </span>
      {t.appName}
    </Link>
  );
}

export function Layout() {
  const { t, user, language, setLanguage, logout } = useApp();
  const text = webText[language];
  const { pathname } = useLocation();
  const menu = useRef<HTMLDetailsElement>(null);
  const account = useRef<HTMLDetailsElement>(null);

  // A new page closes the open menus
  useEffect(() => {
    if (menu.current) menu.current.open = false;
    if (account.current) account.current.open = false;
  }, [pathname]);

  const pages = [
    { to: '/', label: text.nav.home },
    { to: '/chat', label: text.nav.chat },
    { to: '/compare', label: text.nav.compare },
    { to: '/saved', label: text.nav.saved },
    { to: '/history', label: text.nav.history },
  ];
  const links = pages.map((page) => (
    <NavLink key={page.to} to={page.to} end className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}>
      {page.label}
    </NavLink>
  ));

  return (
    <div className="site">
      <header className="site-header">
        <div className="site-header-inner">
          <Brand />
          <nav className="site-nav" aria-label={t.appName}>
            {links}
          </nav>

          <div className="site-header-end">
            {/* One click switches every page between English and Kannada */}
            <button type="button" className="language-button" onClick={() => setLanguage(language === 'en' ? 'kn' : 'en')} aria-label={t.switchLanguage}>
              {t.otherLanguage}
            </button>

            {/* The farmer's own menu */}
            <details className="dropdown" ref={account}>
              <summary className="account-button" aria-label={text.nav.profile}>
                <Avatar small />
                <span className="account-name">{user?.full_name.split(' ')[0]}</span>
              </summary>
              <div className="dropdown-panel">
                <Link to="/profile" className="dropdown-item">
                  {text.nav.profile}
                </Link>
                <Link to="/about" className="dropdown-item">
                  {t.profileMenu.about}
                </Link>
                <button type="button" className="dropdown-item" onClick={logout}>
                  {t.logout}
                </button>
              </div>
            </details>

            {/* Narrow screens: the pages fold into this menu */}
            <details className="dropdown site-menu" ref={menu}>
              <summary className="menu-button" aria-label={text.nav.menu}>
                ☰ <span className="menu-label">{text.nav.menu}</span>
              </summary>
              <div className="dropdown-panel">{links}</div>
            </details>
          </div>
        </div>
      </header>

      <main className="page">
        <div hidden={pathname !== '/'}>
          <Home />
        </div>
        <div hidden={pathname !== '/chat'}>
          <Chat />
        </div>
        <div hidden={pathname !== '/profile'}>
          <Profile active={pathname === '/profile'} />
        </div>
        {!KEPT_OPEN.includes(pathname) && <Outlet />}
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="stack-small">
            <Brand />
            <p className="note">{t.about.intro}</p>
          </div>
          <div className="stack-small">
            <p className="footer-title">{text.footer.pages}</p>
            {pages.map((page) => (
              <Link key={page.to} to={page.to} className="footer-link">
                {page.label}
              </Link>
            ))}
            <Link to="/about" className="footer-link">
              {t.profileMenu.about}
            </Link>
          </div>
          <div className="stack-small">
            <p className="footer-title">{text.footer.data}</p>
            <p className="note">{text.footer.sources}</p>
            <p className="note">{text.footer.project}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
