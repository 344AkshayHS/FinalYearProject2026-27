import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { allCropFacts, answerQuestion, HELP_CONTACTS, replyLanguage } from '@/lib/chatbot';
import { CROP_INFO } from '@/lib/crop-info';
import { normaliseQuestion } from '@/lib/farmer-words';
import { cropName, translations } from '@/lib/translations';
import { colors, radius } from '@/theme';

type Message = { id: number; from: 'user' | 'bot'; text: string };

const CROPS = Object.keys(CROP_INFO);
const HISTORY = 6; // earlier messages sent along, so "and how much water?" follows the conversation

export default function ChatScreen() {
  const { t, language, token, farm } = useApp();
  const insets = useSafeAreaInsets();
  // Opened from a result: start the chat about that crop
  const params = useLocalSearchParams<{ crop?: string }>();
  const startCrop = params.crop && CROP_INFO[params.crop] ? params.crop : null;

  const [crop, setCrop] = useState<string | null>(startCrop);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, from: 'bot', text: t.chat.intro.replace('{count}', String(CROPS.length)) },
  ]);
  const [waiting, setWaiting] = useState(false);
  const list = useRef<FlatList<Message>>(null);
  const nextId = useRef(1);

  function addMessage(from: Message['from'], text: string) {
    const id = nextId.current++;
    setMessages((old) => [...old, { id, from, text }]);
  }

  async function ask(typed: string, aboutCrop = crop) {
    const question = typed.trim();
    if (!question || waiting) {
      return;
    }
    // Reply in the language the question was asked in
    const replyIn = replyLanguage(question, language);
    const reply = answerQuestion(question, aboutCrop, replyIn, farm);
    const history = messages.slice(1).slice(-HISTORY).map(({ from, text }) => ({ from, text }));
    setInput('');
    addMessage('user', question);

    // The app's own checked answer comes first. Only when it cannot answer (a detail or crop its facts do not
    // cover, a question it cannot read) is the LLM on our server asked. It gets every crop's checked facts,
    // the farmer's last result, official help contacts and the recent conversation, and may fall back on
    // general farming knowledge - such a reply is marked "general information, please confirm". If it can't
    // answer safely (no key, limit reached, offline, a number not in the facts, a chemical dose), the app's
    // own answer is shown instead.
    let answer = reply.text;
    let answerCrop = reply.crop;
    if (reply.askLlm) {
      setWaiting(true);
      try {
        const data = await api<{ answer: string; crop: string | null; source: 'facts' | 'general' }>('/chat', {
          method: 'POST',
          token,
          body: {
            question,
            language: replyIn,
            history,
            current_crop: reply.crop ?? aboutCrop, // the crop the app read in the question, in any spelling
            read_as: normaliseQuestion(question).trim(), // "ragi ge gobbara yavaga" -> "ragi fertilizer when"
            facts: { crops: allCropFacts(), help_contacts: HELP_CONTACTS },
            farm,
            not_available: translations[replyIn].chat.noDataGeneral,
          },
        });
        answer = data.source === 'general' ? `${data.answer}\n\n${translations[replyIn].chat.generalNote}` : data.answer;
        answerCrop = data.crop && CROP_INFO[data.crop] ? data.crop : answerCrop;
      } catch {
        // keep the rule-based answer
      }
      setWaiting(false);
    }
    setCrop(answerCrop);
    addMessage('bot', answer);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(message) => String(message.id)}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 10 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListFooterComponent={
          waiting ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ fontSize: 15, color: colors.muted }}>{t.chat.thinking}</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const mine = item.from === 'user';
          return (
            <View
              style={{
                maxWidth: '85%',
                alignSelf: mine ? 'flex-end' : 'flex-start',
                padding: 14,
                borderRadius: radius.medium,
                borderCurve: 'continuous',
                backgroundColor: mine ? colors.primary : colors.card,
              }}>
              <Text selectable style={{ fontSize: 16, lineHeight: 23, color: mine ? colors.white : colors.text }}>
                {item.text}
              </Text>
            </View>
          );
        }}
      />

      <View
        style={{
          gap: 10,
          paddingTop: 10,
          paddingBottom: insets.bottom + 10,
          borderTopWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        }}>
        {/* Quick questions about the current crop, or a list of crops to pick from */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {crop ? (
            <>
              <Chip label={t.chat.askName} onPress={() => ask(t.chat.askName)} />
              <Chip label={t.chat.askWater} onPress={() => ask(t.chat.askWater)} />
              <Chip label={t.chat.askTime} onPress={() => ask(t.chat.askTime)} />
            </>
          ) : null}
          {CROPS.map((name) => (
            <Chip
              key={name}
              label={cropName(name, language)}
              selected={name === crop}
              onPress={() => ask(cropName(name, language), name)}
            />
          ))}
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => ask(input)}
            placeholder={t.chat.placeholder}
            placeholderTextColor={colors.muted}
            returnKeyType="send"
            style={{
              flex: 1,
              minHeight: 50,
              paddingHorizontal: 16,
              fontSize: 17,
              color: colors.text,
              backgroundColor: colors.card,
              borderRadius: radius.small,
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />
          <Pressable
            onPress={() => ask(input)}
            accessibilityRole="button"
            style={{
              justifyContent: 'center',
              paddingHorizontal: 18,
              borderRadius: radius.small,
              backgroundColor: colors.primary,
            }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.white }}>{t.chat.send}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
