// What GreenRoot is, its version, and where its data and photos come from.
// Same as frontend/src/app/about.tsx on the phone.

import { BackLink, Card } from '~/components/ui';
import { useApp } from '~/lib/app-context';
import { version } from '../../package.json';

export function About() {
  const { t } = useApp();
  return (
    <div className="stack-large narrow">
      <BackLink />
      <div className="about-top">
        <img src="/favicon.png" alt="" className="about-logo" />
        <h1>{t.appName}</h1>
        <p className="note">{t.about.version.replace('{v}', version)}</p>
      </div>

      <p className="big-text">{t.about.intro}</p>

      <Card>
        <h2>{t.about.dataTitle}</h2>
        <ul className="about-list">
          {t.about.data.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      <p className="note">{t.disclaimer}</p>
    </div>
  );
}
