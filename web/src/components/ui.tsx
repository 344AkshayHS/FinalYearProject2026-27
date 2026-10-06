// The small building blocks every page uses. They are plain HTML elements with a class name;
// the look of each class is in src/styles.css. The phone app has the same pieces as separate files
// (button.tsx, card.tsx, chip.tsx, text-field.tsx, bar-chart.tsx).

import type { InputHTMLAttributes, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useApp } from '~/lib/app-context';

// White rounded box used for every section. accent = the warm yellow one for the best crop.
export function Card({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return <section className={accent ? 'card card-accent' : 'card'}>{children}</section>;
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />;
}

type ButtonProps = {
  title: string;
  onClick?: () => void;
  loading?: boolean;
  variant?: 'primary' | 'outline';
  submit?: boolean; // the button of a form
};

export function Button({ title, onClick, loading = false, variant = 'primary', submit = false }: ButtonProps) {
  return (
    <button type={submit ? 'submit' : 'button'} className={`button button-${variant}`} onClick={onClick} disabled={loading}>
      {loading && <Spinner />}
      {title}
    </button>
  );
}

// Small round button for picking one option (a crop, an answer, a question)
export function Chip({ label, onClick, selected = false }: { label: string; onClick: () => void; selected?: boolean }) {
  return (
    <button type="button" className={selected ? 'chip chip-selected' : 'chip'} aria-pressed={selected} onClick={onClick}>
      {label}
    </button>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string };

export function TextField({ label, hint, ...inputProps }: FieldProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input {...inputProps} />
      {hint && <span className="note">{hint}</span>}
    </label>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="note">{children}</p>;
}

export function ErrorBox({ message }: { message: string | null }) {
  return message ? (
    <p className="error-box" role="alert">
      {message}
    </p>
  ) : null;
}

// A horizontal bar: score is 0-100
export function ScoreBar({ score, tone = 'primary' }: { score: number; tone?: 'primary' | 'accent' | 'danger' }) {
  return (
    <div className="bar">
      <div className={`bar-fill bar-${tone}`} style={{ width: `${Math.min(Math.max(score, 3), 100)}%` }} />
    </div>
  );
}

// Small tag under a crop name
export function Badge({ kind, label }: { kind: 'confident' | 'yearRound' | 'irrigation'; label: string }) {
  const icon = { confident: '✓', yearRound: '🌳', irrigation: '💧' }[kind];
  return (
    <span className={`badge badge-${kind}`}>
      {icon} {label}
    </span>
  );
}

export type Bar = { label: string; value: number; highlight?: boolean };

// Simple horizontal bar chart built from divs (no chart library).
// Negative values (e.g. SHAP) are drawn in red, positive in green.
export function BarChart({ bars, format = (value) => value.toFixed(2), max }: { bars: Bar[]; format?: (value: number) => string; max?: number }) {
  const biggest = max ?? Math.max(...bars.map((bar) => Math.abs(bar.value)), 0.0001);

  return (
    <div className="stack-small">
      {bars.map((bar) => (
        <div key={bar.label}>
          <div className="row-between">
            <span className={bar.highlight ? 'bold' : undefined}>
              {bar.highlight ? '★ ' : ''}
              {bar.label}
            </span>
            <span className="bold number">{format(bar.value)}</span>
          </div>
          <ScoreBar score={(Math.abs(bar.value) / biggest) * 100} tone={bar.value < 0 ? 'danger' : bar.highlight ? 'accent' : 'primary'} />
        </div>
      ))}
    </div>
  );
}

// "‹ Back" at the top of a page that opens over the tabs: back to the page before, or Home when the page was
// opened straight from its address
export function BackLink() {
  const { t } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <button type="button" className="link-button back-link" onClick={() => (location.key !== 'default' ? navigate(-1) : navigate('/'))}>
      ‹ {t.back}
    </button>
  );
}
