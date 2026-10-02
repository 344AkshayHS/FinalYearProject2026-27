import { useState } from 'react';

import { Card, TextField } from '~/components/ui';
import { useApp } from '~/lib/app-context';

export const SOIL_TEST_KEYS = ['ph', 'organic_carbon_pct', 'n', 'p', 'k'] as const;
export type SoilTestKey = (typeof SOIL_TEST_KEYS)[number];
export type SoilTestValues = Record<SoilTestKey, string>;

export const EMPTY_SOIL_TEST: SoilTestValues = { ph: '', organic_carbon_pct: '', n: '', p: '', k: '' };

// Only the filled-in values, as numbers, for the /recommend request (null when nothing was typed)
export function soilTestBody(values: SoilTestValues) {
  const filled = SOIL_TEST_KEYS.filter((key) => values[key].trim() !== '');
  if (filled.length === 0) {
    return null;
  }
  return Object.fromEntries(filled.map((key) => [key, Number(values[key].replace(',', '.'))]));
}

// Optional values from the farmer's own soil test (Soil Health Card)
export function SoilTestForm({ values, onChange }: { values: SoilTestValues; onChange: (values: SoilTestValues) => void }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <button type="button" className="link-button big-link" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '▾ ' + t.soilTest.close : '▸ ' + t.soilTest.open}
      </button>

      {open && (
        <div className="stack">
          <p className="note">{t.soilTest.intro}</p>
          <div className="fields-grid">
            {SOIL_TEST_KEYS.map((key) => (
              <TextField
                key={key}
                label={t.soilTest[key]}
                value={values[key]}
                onChange={(e) => onChange({ ...values, [key]: e.target.value })}
                inputMode="decimal"
                maxLength={8}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
