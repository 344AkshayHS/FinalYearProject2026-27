import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { allCropFacts, answerQuestion, cropFacts, notAvailable, replyLanguage } from '@/lib/chatbot';
import { CROP_INFO } from '@/lib/crop-info';
import { cropName } from '@/lib/translations';
import { colors, radius } from '@/theme';

type Message = { id: number; from: 'user' | 'bot'; text: string };

const CROPS = Object.keys(CROP_INFO);

export default function ChatScreen() {
  const { t, language, token } = useApp();
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
    const reply = answerQuestion(question, aboutCrop, replyIn);
    setCrop(reply.crop);
    setInput('');
    addMessage('user', question);

    // First ask the LLM on our server. It only gets checked facts: one crop's facts when the question
    // is about a crop, otherwise the short facts of every crop, so it can compare them.
    // If it can't answer safely (no key, limit reached, offline, a number not in the facts),
    // the rule-based answer is shown instead.
    let answer = reply.text;
    if (reply.askLlm) {
      setWaiting(true);
      try {
        const data = await api<{ answer: string }>('/chat', {
          method: 'POST',
          token,
          body: {
            question,
            language: replyIn,
            facts: reply.crop ? cropFacts(reply.crop) : allCropFacts(),
            not_available: reply.crop ? notAvailable(reply.crop, replyIn) : t.chat.noDataGeneral,
          },
        });
        answer = data.answer;
      } catch {
        // keep the rule-based answer
      }
      setWaiting(false);
    }
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
