// The frame around every page a logged-in farmer sees: the top bar (name, language switch) and the bar at the
// bottom with three tabs, Home, Chatbot and Profile, the same as the phone app (frontend/src/app/(tabs)/_layout.tsx).
//
// Like the phone, the three tab pages stay open while the farmer moves between them; the others are only hidden.
// So a result on Home, or a chat, is still there when they come back. The ML dashboard pages show in <Outlet />.

import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import { useApp } from '~/lib/app-context';
import { Chat } from '~/pages/Chat';
import { Home } from '~/pages/Home';
import { Profile } from '~/pages/Profile';

const TAB_PAGES = ['/', '/chat', '/profile'];

// The tab icons (24 x 24), in the colour of the text. Outlines; the chosen tab's icon is filled (see styles.css).
function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="tab-icon" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="tab-icon" aria-hidden="true">
      <path d="M6 4h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 2-2z" />
      <circle className="tab-icon-dot" cx="8.5" cy="10.5" r="1.3" />
      <circle className="tab-icon-dot" cx="12" cy="10.5" r="1.3" />
      <circle className="tab-icon-dot" cx="15.5" cy="10.5" r="1.3" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="tab-icon" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
    </svg>
  );
}

// One tab: the icon on its pill (shown on the chosen tab), the name under it
function Tab({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <NavLink to={to} end className={({ isActive }) => (isActive ? 'tab tab-active' : 'tab')}>
      <span className="tab-pill">{icon}</span>
      {label}
    </NavLink>
  );
}

export function Layout() {
  const { t, language, setLanguage } = useApp();
  const { pathname } = useLocation();

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand">
            🌱 {t.appName}
          </Link>
          {/* One click switches every page between English and Kannada */}
          <button type="button" className="link-button" onClick={() => setLanguage(language === 'en' ? 'kn' : 'en')} aria-label={t.switchLanguage}>
            {t.otherLanguage}
          </button>
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
        {!TAB_PAGES.includes(pathname) && <Outlet />}
      </main>

      <nav className="tab-bar" aria-label={t.appName}>
        <div className="tab-bar-inner">
          <Tab to="/" label={t.tabs.home} icon={<HomeIcon />} />
          <Tab to="/chat" label={t.tabs.chat} icon={<ChatIcon />} />
          <Tab to="/profile" label={t.tabs.profile} icon={<ProfileIcon />} />
        </div>
      </nav>
    </>
  );
}
