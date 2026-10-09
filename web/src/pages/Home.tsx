// The home page: a band at the top with the three steps, then on a wide screen two columns: "Your land" on the
// left (where the field is, the season, rain or irrigation, an optional soil test, and "Find crops") and on the
// right the weather and the crops the model recommends. On a phone the two columns stack. Same steps as
// frontend/src/app/(tabs)/index.tsx on the phone.

import { useState } from 'react';

import { LocationCard } from '~/components/LocationCard';
import { Results } from '~/components/Results';
import { EMPTY_SOIL_TEST, SoilTestForm, soilTestBody } from '~/components/SoilTestForm';
import { Button, Card, Chip, Note, ReloadIcon, Spinner } from '~/components/ui';
import { WaterSourceCard } from '~/components/WaterSourceCard';
import { WeatherCard, type WeatherPlace } from '~/components/WeatherCard';
import { api, ApiError } from '~/lib/api';
import { useApp } from '~/lib/app-context';
import type { RecommendResponse, WaterSource } from '~/lib/types';
import { useFarmLocation } from '~/lib/use-farm-location';
import { webText } from '~/lib/web-text';
import { SEASONS, seasonNow, type Season } from '@/lib/season';
import { districtName } from '@/lib/translations';

function errorCode(err: unknown) {
  return err instanceof ApiError ? err.code : 'server_error';
}

export function Home() {
  const { t, user, language, setLastResult } = useApp();
  const text = webText[language].home;
  const location = useFarmLocation();
  const { state, district, taluk, gps, detecting } = location;

  // The farmer's own soil test values (optional)
  const [soilTest, setSoilTest] = useState(EMPTY_SOIL_TEST);
  // Rain only or irrigated: on rain-fed land, crops the rain can't support this year are marked
  const [waterSource, setWaterSource] = useState<WaterSource>('rain');
  // The season to sow in: crops change with it. Starts at the season of today's date.
  const [season, setSeason] = useState<Season>(seasonNow);

  // Recommendation
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendResponse | null>(null);
  // What the shown result was asked for (place and soil test), to notice when the farmer changes either
  const [checkedFor, setCheckedFor] = useState<string | null>(null);

  const firstName = user?.full_name.split(' ')[0] ?? '';
  // The weather card follows the same place: the browser's position, or the middle of the district picked by hand
  const weatherPlace: WeatherPlace | null = gps
    ? { lat: gps.lat, lng: gps.lng }
    : district && state
      ? { state, district }
      : null;
  // How far the farmer is: 1 choose the place, 2 season and water, 3 find crops
  const step = !district ? 0 : result ? 3 : 1;

  // Rain only / Irrigated: the crop pages and the chat follow the choice too
  function changeWaterSource(source: WaterSource) {
    setWaterSource(source);
    if (result) {
      setLastResult({ data: result, waterSource: source });
    }
  }

  // With GPS we check the exact spot; a hand-picked Karnataka district (or taluk): sample farms across all of it;
  // a district of another state: one spot in its middle
  const place = gps ? { lat: gps.lat, lng: gps.lng, state: gps.state, district } : { state, district, taluk: taluk?.key };
  const askingFor = JSON.stringify({ place, soil: soilTestBody(soilTest) });
  // The place or the soil test changed since the crops were found: a note above "Check again" says so
  const outdated = result !== null && checkedFor !== askingFor;

  // forSeason: a season chip clicked after a result is shown asks again at once, before the state updates
  async function findCrops(forSeason: Season = season) {
    if (!district) {
      return;
    }
    setAnalysing(true);
    setError(null);
    try {
      const body = { ...place, season: forSeason, soil_test: soilTestBody(soilTest) };
      const data = await api<RecommendResponse>('/recommend', { method: 'POST', body });
      setResult(data);
      setCheckedFor(askingFor);
      setLastResult({ data, waterSource }); // for the crop pages, and the crop helper chat ("can I grow rice here?")
    } catch (err) {
      setError(errorCode(err));
    }
    setAnalysing(false);
  }

  return (
    <div className="stack-large">
      {/* The band at the top: hello, what the page does, and the three steps */}
      <section className="hero">
        <div className="stack-small">
          <h1>{t.hello.replace('{name}', firstName)} 👋</h1>
          <p className="hero-text">{text.intro}</p>
        </div>
        <ol className="steps">
          {text.steps.map((label, index) => (
            <li key={label} className={index < step ? 'step step-done' : index === step ? 'step step-now' : 'step'}>
              <span className="step-number">{index < step ? '✓' : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      </section>

      <div className="home-layout">
        {/* Your land: everything the farmer chooses */}
        <aside className="land-panel" aria-label={text.yourLand}>
          <div className="stack-tiny">
            <h2>{text.yourLand}</h2>
            <Note>{text.yourLandIntro}</Note>
          </div>

          <LocationCard location={location} />

          {/* Season to sow in: the model answers for this season */}
          <Card>
            <h3>{t.seasonTitle}</h3>
            <div className="chips">
              {SEASONS.map((option) => (
                <Chip
                  key={option}
                  label={t.seasons[option]}
                  selected={season === option}
                  onClick={() => {
                    if (analysing) {
                      return; // one question at a time: a second click would save the same result twice
                    }
                    setSeason(option);
                    if (result && option !== season) {
                      findCrops(option);
                    }
                  }}
                />
              ))}
            </div>
            <Note>{t.seasonHelp}</Note>
          </Card>

          {/* Water for this land: decides whether crops the rain can't support are marked. Once crops are shown it
              moves under the best crop (in Results), where the farmer sees what the choice changes. */}
          {!result && <WaterSourceCard value={waterSource} onChange={changeWaterSource} />}

          <SoilTestForm values={soilTest} onChange={setSoilTest} />

          {/* Find crops, at the end of the panel */}
          {outdated && !analysing && <p className="callout callout-warning">📍 {t.placeChanged.replace('{button}', t.checkAgain)}</p>}
          {district && !detecting && (
            <div className="find-crops">
              <Button
                title={result ? t.checkAgain : t.findCrops}
                onClick={() => findCrops()}
                loading={analysing}
                icon={result ? <ReloadIcon /> : undefined}
              />
            </div>
          )}
        </aside>

        {/* The weather and the answer */}
        <div className="stack-large home-main">
          {!detecting && weatherPlace && (
            <WeatherCard
              place={weatherPlace}
              districtLabel={state === 'Karnataka' ? districtName(district ?? '', language) : (district ?? '')}
            />
          )}

          {analysing && (
            <Card>
              <p className="row">
                <Spinner /> {t.analysing}
              </p>
            </Card>
          )}

          {error && !analysing && (
            <div className="callout callout-danger">
              <p className="error-text">{t.errors[error] ?? t.errors.server_error}</p>
              <button type="button" className="link-button danger-link" onClick={() => findCrops()}>
                {t.tryAgain}
              </button>
            </div>
          )}

          {result && !analysing && <Results data={result} waterSource={waterSource} onWaterSourceChange={changeWaterSource} />}

          {/* Before the first answer: what will come here */}
          {!result && !analysing && !error && (
            <section className="empty-state">
              <span className="empty-state-icon" aria-hidden="true">
                🌾
              </span>
              <h2>{text.emptyTitle}</h2>
              <p className="note">{text.emptyText.replace('{button}', t.findCrops)}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
