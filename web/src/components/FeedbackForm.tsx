import { useState, type FormEvent } from 'react';

import { Button, Card, Chip, ErrorBox } from '~/components/ui';
import { api, ApiError } from '~/lib/api';
import { useApp } from '~/lib/app-context';
import { CROP_INFO } from '@/lib/crop-info';
import { cropName } from '@/lib/translations';

const OUTCOMES = ['good', 'average', 'poor'] as const;

// "I grew this crop here and it went good / average / poor" - saved for retraining the model.
// The recommended crops come first, then every other crop the model knows.
export function FeedbackForm({ recommendationId, recommended }: { recommendationId: string; recommended: string[] }) {
  const { t, language } = useApp();
  const [crop, setCrop] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number] | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crops = [...recommended, ...Object.keys(CROP_INFO).filter((name) => !recommended.includes(name))];

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!crop || !outcome) {
      setError('feedback_invalid');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api('/feedback', {
        method: 'POST',
        body: { recommendation_id: Number(recommendationId), crop, outcome, note: note.trim() || null },
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'server_error');
    }
    setSending(false);
  }

  if (saved) {
    return (
      <Card>
        <p className="big-text bold primary-text">✓ {t.feedback.thanks}</p>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={send} className="stack">
        <h2>🌱 {t.feedback.title}</h2>
        <p className="note">{t.feedback.intro}</p>

        <p className="bold">{t.feedback.whichCrop}</p>
        <div className="chips">
          {crops.map((name) => (
            <Chip key={name} label={cropName(name, language)} selected={name === crop} onClick={() => setCrop(name)} />
          ))}
        </div>

        <p className="bold">{t.feedback.howWent}</p>
        <div className="chips">
          {OUTCOMES.map((value) => (
            <Chip key={value} label={t.feedback[value]} selected={value === outcome} onClick={() => setOutcome(value)} />
          ))}
        </div>

        <label className="field">
          <span className="field-label">{t.feedback.note}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} />
        </label>

        <ErrorBox message={error ? (t.errors[error] ?? t.errors.server_error) : null} />
        <Button title={t.feedback.send} loading={sending} submit />
      </form>
    </Card>
  );
}
