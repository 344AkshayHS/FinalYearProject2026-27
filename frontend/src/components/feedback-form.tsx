import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { TextField } from '@/components/text-field';
import { api, ApiError } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { CROP_INFO } from '@/lib/crop-info';
import { cropName } from '@/lib/translations';
import { colors } from '@/theme';

const OUTCOMES = ['good', 'average', 'poor'] as const;

// "I grew this crop here and it went good / average / poor" - saved for retraining the model.
// The recommended crops come first, then every other crop the model knows.
export function FeedbackForm({ recommendationId, recommended }: { recommendationId: string; recommended: string[] }) {
  const { t, language, token } = useApp();
  const [crop, setCrop] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number] | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crops = [...recommended, ...Object.keys(CROP_INFO).filter((name) => !recommended.includes(name))];

  async function send() {
    if (!crop || !outcome) {
      setError('feedback_invalid');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api('/feedback', {
        method: 'POST',
        token,
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
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.primary }}>✓ {t.feedback.thanks}</Text>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>🌱 {t.feedback.title}</Text>
      <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{t.feedback.intro}</Text>

      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{t.feedback.whichCrop}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {crops.map((name) => (
          <Chip key={name} label={cropName(name, language)} selected={name === crop} onPress={() => setCrop(name)} />
        ))}
      </ScrollView>

      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{t.feedback.howWent}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {OUTCOMES.map((value) => (
          <Chip key={value} label={t.feedback[value]} selected={value === outcome} onPress={() => setOutcome(value)} />
        ))}
      </View>

      <TextField label={t.feedback.note} value={note} onChangeText={setNote} maxLength={500} multiline />

      {error && (
        <Text selectable style={{ fontSize: 15, color: colors.danger }}>
          {t.errors[error] ?? t.errors.server_error}
        </Text>
      )}
      <Button title={t.feedback.send} onPress={send} loading={sending} />
    </Card>
  );
}
