import { useNavigation, type ErrorBoundaryProps } from 'expo-router';
import { useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { KeyboardView } from '@/components/keyboard-view';
import { LanguageButton } from '@/components/language-button';
import { Text } from '@/components/text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { inputFontSize } from '@/lib/text-size';
import { allCropFacts, answerQuestion, followUpQuestions, HELP_CONTACTS, replyLanguage } from '@/lib/chatbot';
import { CROP_INFO } from '@/lib/crop-info';
import { normaliseQuestion } from '@/lib/farmer-words';
import { cropName, translations } from '@/lib/translations';
import { weatherAnswer, type WeatherNow } from '@/lib/weather';
import { colors, radius } from '@/theme';

type Message = { id: number; from: 'user' | 'bot'; text: string };

const CROPS = Object.keys(CROP_INFO);
const HISTORY = 6; // earlier messages sent along, so "and how much water?" follows the conversation

// The first message of every chat: what the helper can answer
function introMessage(t: (typeof translations)['en']): Message {
  return { id: 0, from: 'bot', text: t.chat.intro.replace('{count}', String(CROPS.length)) };
}

export default function ChatScreen() {
  const { t, language, token, farm, forecastPlace, textSize } = useApp();
  const navigation = useNavigation();
  // After "Find crops" on Home, the chat is about the best crop of that result
  const bestCrop = farm?.model_top_crops_for_this_land[0]?.crop ?? null;

  const [crop, setCrop] = useState<string | null>(bestCrop);
  // A new result while the chat is open (the tabs stay open): switch to its best crop
  const [resultCrop, setResultCrop] = useState(bestCrop);
  if (bestCrop !== resultCrop) {
    setResultCrop(bestCrop);
    setCrop(bestCrop && CROP_INFO[bestCrop] ? bestCrop : null);
  }
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>(() => [introMessage(t)]);
  const [waiting, setWaiting] = useState(false);
  // The farmer's last question ('' before the first), for the questions offered under the answer
  const lastQuestion = [...messages].reverse().find((message) => message.from === 'user')?.text ?? '';
  const list = useRef<FlatList<Message>>(null);
  const nextId = useRef(1);
  // Goes up with each new chat, so an answer still on its way from an old chat is not added to the new one
  const conversation = useRef(0);

  function addMessage(from: Message['from'], text: string) {
    const id = nextId.current++;
    setMessages((old) => [...old, { id, from, text }]);
  }

  // "New chat" at the top right, next to the language, once something has been asked. It asks first, then
  // empties the chat (the crop goes back to the best crop of the last result).
  const hasQuestions = messages.length > 1;
  useLayoutEffect(() => {
    function newChat() {
      conversation.current += 1;
      setMessages([introMessage(t)]);
      setInput('');
      setWaiting(false);
      setCrop(bestCrop && CROP_INFO[bestCrop] ? bestCrop : null);
    }
    function confirmNewChat() {
      Alert.alert(t.chat.newChatTitle, t.chat.newChatMessage, [
        { text: t.chat.cancel, style: 'cancel' },
        { text: t.chat.newChat, style: 'destructive', onPress: newChat },
      ]);
    }
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          {hasQuestions && (
            <Pressable onPress={confirmNewChat} accessibilityRole="button" hitSlop={10}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}>{t.chat.newChat}</Text>
            </Pressable>
          )}
          <LanguageButton />
        </View>
      ),
    });
  }, [navigation, hasQuestions, t, bestCrop]);

  async function ask(typed: string, aboutCrop = crop) {
    const question = typed.trim();
    if (!question || waiting) {
      return;
    }
    // Reply in the language the question was asked in
    const replyIn = replyLanguage(question, language);
    const reply = answerQuestion(question, aboutCrop, replyIn, farm);
    const history = messages.slice(1).slice(-HISTORY).map(({ from, text }) => ({ from, text }));
    const thisChat = conversation.current;
    setInput('');
    addMessage('user', question);
    list.current?.scrollToOffset({ offset: 0, animated: true }); // the newest message is at the bottom

    // The app's own checked answer comes first. Only when it cannot answer (a detail or crop its facts do not
    // cover, a question it cannot read) is the LLM on our server asked. It gets every crop's checked facts,
    // the farmer's last result, official help contacts and the recent conversation, and may fall back on
    // general farming knowledge - such a reply is marked "general information, please confirm". If it can't
    // answer safely (no key, limit reached, offline, a number not in the facts, a chemical dose), the app's
    // own answer is shown instead.
    let answer = reply.text;
    let answerCrop = reply.crop;
    // "Today's weather?": the forecast for the place of the weather card on Home (without a place, the reply
    // asks the farmer to give one there)
    if (reply.weather && forecastPlace) {
      setWaiting(true);
      try {
        const weather = await api<WeatherNow>(`/weather/now?${forecastPlace.query}`, { token });
        answer = weatherAnswer(weather, forecastPlace.label, replyIn);
      } catch {
        answer = translations[replyIn].weatherNow.chatFailed;
      }
      setWaiting(false);
    }
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
    if (thisChat !== conversation.current) {
      return; // "New chat" was pressed while waiting
    }
    setCrop(answerCrop);
    addMessage('bot', answer);
  }

  return (
    // The typing box stays above the keyboard
    <KeyboardView>
      {/* Upside down (inverted), as chat apps do: the newest message sits at the bottom by itself, and the farmer
          can scroll up through the whole chat without the list jumping back down. Data and header are flipped too:
          the questions offered next (ListHeaderComponent) show under the last answer. A short chat starts at the
          top (justifyContent flex-end, flipped). */}
      <FlatList
        ref={list}
        inverted
        data={[...messages].reverse()}
        keyExtractor={(message) => String(message.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1, justifyContent: 'flex-end' }}
        ListHeaderComponent={
          waiting ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ fontSize: 15, color: colors.muted }}>{t.chat.thinking}</Text>
            </View>
          ) : (
            // Questions to ask next, under the last answer (the app answers each of them itself)
            <View style={{ gap: 8, paddingTop: 4, alignItems: 'flex-start' }}>
              {followUpQuestions(lastQuestion, crop, replyLanguage(lastQuestion, language), farm).map((question) => (
                <Pressable
                  key={question}
                  onPress={() => ask(question)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    borderWidth: 1.5,
                    borderColor: colors.primary,
                    backgroundColor: colors.card,
                    opacity: pressed ? 0.7 : 1,
                  })}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.primaryDark }}>{question}</Text>
                </Pressable>
              ))}
            </View>
          )
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
              <Text style={{ fontSize: 16, lineHeight: 23, color: mine ? colors.white : colors.text }}>
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
          paddingBottom: 10,
          borderTopWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        }}>
        {/* The crops to pick from */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
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
            submitBehavior="submit" // the keyboard stays open for the next question
            style={{
              flex: 1,
              minHeight: 50,
              paddingHorizontal: 16,
              fontSize: inputFontSize(textSize),
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
    </KeyboardView>
  );
}

// If the chat screen ever fails, this shows instead of closing the app, with a button to start a new chat
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const { t } = useApp();
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 17, lineHeight: 24, color: colors.text, textAlign: 'center' }}>{t.chat.broken}</Text>
      <Button title={t.chat.newChat} onPress={retry} />
    </View>
  );
}
