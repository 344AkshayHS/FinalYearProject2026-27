import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { Card } from '@/components/card';
import { FeedbackForm } from '@/components/feedback-form';
import { Text } from '@/components/text';
import { useApp, useColors } from '@/lib/app-context';
import { useNotices } from '@/lib/notices-context';
import { placeOf } from '@/lib/past-results';

// "How are your crops?" for one past result, opened from the bell (app/notifications.tsx). The same feedback form
// as under a result; once it is sent, the bell stops asking about this result.
export default function FeedbackScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, language } = useApp();
  const { results, refresh } = useNotices();
  const result = results?.find((item) => item.id === id);

  if (!result) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Card>
          <Text style={{ fontSize: 17, color: colors.text }}>{t.feedbackPage.missing}</Text>
        </Card>
      </ScrollView>
    );
  }

  const date = new Date(result.created_at).toLocaleDateString(language === 'kn' ? 'kn-IN' : 'en-IN', { day: 'numeric', month: 'long' });
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}>
      <Text style={{ fontSize: 17, lineHeight: 24, color: colors.text }}>
        {t.feedbackPage.about.replace('{date}', date).replace('{place}', placeOf(result, language))}
      </Text>
      <FeedbackForm recommendationId={result.id} recommended={(result.crops ?? []).map((item) => item.crop)} onSaved={refresh} />
    </ScrollView>
  );
}
