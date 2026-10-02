// The home page: where the land is, the season, rain or irrigation, an optional soil test,
// and then the crops the model recommends. Same steps as frontend/src/app/index.tsx on the phone.

import { useState } from 'react';

import { Chat } from '~/components/Chat';
import { LocationCard } from '~/components/LocationCard';
import { Results } from '~/components/Results';
import { EMPTY_SOIL_TEST, SoilTestForm, soilTestBody } from '~/components/SoilTestForm';
import { Button, Card, Chip, Note } from '~/components/ui';
import { api, ApiError } from '~/lib/api';
import { useApp } from '~/lib/app-context';
import type { RecommendResponse, WaterSource } from '~/lib/types';
import { useFarmLocation } from '~/lib/use-farm-location';
import { farmSummary } from '@/lib/chatbot';
import { SEASONS, seasonNow, type Season } from '@/lib/season';

function errorCode(err: unknown) {
  return err instanceof ApiError ? err.code : 'server_error';
}

export function Home() {
  const { t, user, setFarm } = useApp();
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

  const firstName = user?.full_name.split(' ')[0] ?? '';

  // forSeason: a season chip clicked after a result is shown asks again at once, before the state updates
  async function findCrops(forSeason: Season = season) {
    if (!district) {
      return;
    }
    setAnalysing(true);
    setError(null);
    try {
      // With GPS we check the exact spot; a hand-picked Karnataka district (or taluk): sample farms across all of it;
      // a district of another state: one spot in its middle
      const place = gps
        ? { lat: gps.lat, lng: gps.lng, state: gps.state, district }
        : { state, district, taluk: taluk?.key };
      const body = { ...place, season: forSeason, soil_test: soilTestBody(soilTest) };
      const data = await api<RecommendResponse>('/recommend', { method: 'POST', body });
      setResult(data);
      setFarm(farmSummary(data, waterSource)); // so the crop helper chat can answer "can I grow rice here?"
    } catch (err) {
      setError(errorCode(err));
    }
    setAnalysing(false);
  }

  return (
    <div className="stack-large">
      <section className="welcome">
        <h1>{t.hello.replace('{name}', firstName)} 👋</h1>
        <p>{t.homeIntro}</p>
      </section>

      <div className="two-columns">
        <LocationCard location={location} />

        <div className="stack-large">
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

          {/* Water for this land: decides whether crops the rain can't support are marked */}
          <Card>
            <h3>{t.waterSourceTitle}</h3>
            <div className="chips">
              {(['rain', 'irrigated'] as const).map((source) => (
                <Chip
                  key={source}
                  label={source === 'rain' ? t.rainOnly : t.irrigated}
                  selected={waterSource === source}
                  onClick={() => {
                    setWaterSource(source);
                    if (result) {
                      setFarm(farmSummary(result, source)); // keep the chat's summary in step
                    }
                  }}
                />
              ))}
            </div>
            <Note>{t.waterSourceHelp}</Note>
          </Card>
        </div>
      </div>

      <SoilTestForm values={soilTest} onChange={setSoilTest} />

      {/* Find crops */}
      {district && !detecting && (
        <div className="find-crops">
          <Button title={result ? t.checkAgain : t.findCrops} onClick={() => findCrops()} loading={analysing} />
        </div>
      )}

      {analysing && <p className="center-text note">{t.analysing}</p>}

      {error && !analysing && (
        <div className="callout callout-danger">
          <p className="error-text">{t.errors[error] ?? t.errors.server_error}</p>
          <button type="button" className="link-button danger-link" onClick={() => findCrops()}>
            {t.tryAgain}
          </button>
        </div>
      )}

      {result && !analysing && <Results data={result} waterSource={waterSource} />}

      {/* Crop helper chat, about the best crop if we have a result */}
      <Chat crop={result?.recommendations[0].crop} />
    </div>
  );
}
