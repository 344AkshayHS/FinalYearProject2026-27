// The profile page: on a wide screen the account on the left (who is logged in, the language, log out) and the
// farmer's pages as tiles on the right (history, saved crops, compare, about). The phone app has the same in one
// column (frontend/src/app/(tabs)/profile.tsx).

import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { LanguageSwitch, TextSizeSwitch } from '~/components/AuthPage';
import { Avatar, Button, Card } from '~/components/ui';
import { api } from '~/lib/api';
import { useApp } from '~/lib/app-context';
import { webText } from '~/lib/web-text';
import { placeOf, type PastResult } from '@/lib/past-results';
import { version } from '../../package.json';

// The menu icons (24 x 24), outlines in the colour of the text, like the tab icons
const ICONS: Record<string, ReactNode> = {
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  saved: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  compare: (
    <>
      <rect x="3" y="4" width="7" height="16" rx="1.5" />
      <rect x="14" y="4" width="7" height="16" rx="1.5" />
    </>
  ),
  about: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
};

// One of the farmer's pages: icon, title and a short line under it
function Tile({ to, icon, title, subtitle }: { to: string; icon: string; title: string; subtitle: string }) {
  return (
    <Link to={to} className="tile">
      <span className="tile-icon">
        <svg viewBox="0 0 24 24" className="menu-icon" aria-hidden="true">
          {ICONS[icon]}
        </svg>
      </span>
      <span className="big-text bold">{title}</span>
      <span className="note">{subtitle}</span>
    </Link>
  );
}

// active: this tab is the one shown (the tabs stay open, see components/Layout.tsx)
export function Profile({ active }: { active: boolean }) {
  const { t, user, language, logout, crops, numerals, setNumerals } = useApp();
  const [latest, setLatest] = useState<PastResult | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  // How many results there are and where the last one was, loaded each time the Profile tab is opened
  useEffect(() => {
    if (!active) {
      return;
    }
    api<{ recommendations: PastResult[]; total: number }>('/users/me/recommendations')
      .then((data) => {
        setLatest(data.recommendations[0] ?? null);
        setTotal(data.total);
      })
      .catch(() => setTotal(null));
  }, [active]);

  const locale = language === 'kn' ? 'kn-IN' : 'en-IN';
  const savedCount = crops && crops !== 'failed' ? crops.saved.length : null;

  return (
    <div className="profile-layout">
      <div className="stack-large">
      {/* Who is logged in */}
      <section className="card profile-card">
        <div className="row">
          <Avatar />
          <div className="stack-tiny">
            <h2>{user?.full_name}</h2>
            <p className="note">+91 {user?.phone}</p>
            {latest && <p className="dark-text">📍 {t.profileMenu.lastPlace.replace('{place}', placeOf(latest, language))}</p>}
          </div>
        </div>
        {user?.created_at && (
          <p className="note">{t.memberSince.replace('{date}', new Date(user.created_at).toLocaleDateString(locale, { dateStyle: 'medium' }))}</p>
        )}
        <Link to="/profile/edit" className="button button-outline">
          {t.editProfile.title}
        </Link>
      </section>


      {/* Text size: bigger letters for people who cannot read small text */}
      <Card>
        <h3>{t.textSize.title}</h3>
        <TextSizeSwitch />
        <p className="note">{t.textSize.sample}</p>
      </Card>

      {/* Language */}
      <Card>
        <h3>{t.language}</h3>
        <LanguageSwitch />
        {/* In Kannada: numbers as 0-9 or as Kannada numerals. The two choices keep their own digits. */}
        {language === 'kn' && (
          <>
            <h3>{t.numbers}</h3>
            <div className="language-switch" data-keep-digits>
              {(['western', 'kannada'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === numerals ? 'language-option language-option-selected' : 'language-option'}
                  aria-pressed={option === numerals}
                  onClick={() => setNumerals(option)}>
                  {option === 'western' ? '123' : '೧೨೩'}
                </button>
              ))}
            </div>
          </>
        )}
      </Card>

      <Button title={t.logout} onClick={logout} variant="outline" />
      </div>

      <div className="stack">
        <h2>{webText[language].nav.profile}</h2>
      {/* History, saved crops, compare, about */}
      <nav className="tile-grid" aria-label={t.profile}>
        <Tile
          to="/history"
          icon="history"
          title={t.profileMenu.history}
          subtitle={!total ? t.profileMenu.historyNone : total === 1 ? t.profileMenu.historyOne : t.profileMenu.historyCount.replace('{n}', String(total))}
        />
        <Tile
          to="/saved"
          icon="saved"
          title={t.profileMenu.saved}
          subtitle={!savedCount ? t.profileMenu.savedNone : savedCount === 1 ? t.profileMenu.savedOne : t.profileMenu.savedCount.replace('{n}', String(savedCount))}
        />
        <Tile to="/compare" icon="compare" title={t.profileMenu.compare} subtitle={t.profileMenu.compareSub} />
        <Tile to="/about" icon="about" title={t.profileMenu.about} subtitle={t.profileMenu.aboutSub.replace('{v}', version)} />
      </nav>
      </div>
    </div>
  );
}
