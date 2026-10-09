// "Water for this land": Rain only or Irrigated. Before a result it is part of "Your land" on Home; once crops are
// shown it sits under the best crop, with what the choice changed (lines from frontend/src/lib/water-choice.ts),
// so the farmer sees the effect of a click. Same as frontend/src/components/water-source-card.tsx on the phone.

import { Card, Chip, Note } from '~/components/ui';
import { useApp } from '~/lib/app-context';
import type { WaterSource } from '@/lib/water-choice';

type Props = { value: WaterSource; onChange: (source: WaterSource) => void; lines?: string[] };

export function WaterSourceCard({ value, onChange, lines }: Props) {
  const { t } = useApp();
  return (
    <Card>
      <h3>{t.waterSourceTitle}</h3>
      <div className="chips">
        {(['rain', 'irrigated'] as const).map((source) => (
          <Chip key={source} label={source === 'rain' ? t.rainOnly : t.irrigated} selected={value === source} onClick={() => onChange(source)} />
        ))}
      </div>
      <Note>{t.waterSourceHelp}</Note>
      {lines && lines.length > 0 && (
        <div className="water-lines" aria-live="polite">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
    </Card>
  );
}
