// The Chatbot tab: the crop helper chat. Same rules as frontend/src/app/(tabs)/chat.tsx on the phone, using the
// same answer rules (frontend/src/lib/chatbot.ts).

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Spinner } from '~/components/ui';
import { api } from '~/lib/api';
import { useApp } from '~/lib/app-context';
import { webText } from '~/lib/web-text';
import { allCropFacts, answerQuestion, followUpQuestions, HELP_CONTACTS, replyLanguage } from '@/lib/chatbot';
import { CROP_INFO } from '@/lib/crop-info';
import { normaliseQuestion } from '@/lib/farmer-words';
import { cropName, translations } from '@/lib/translations';
import { weatherAnswer, type WeatherNow } from '@/lib/weather';

type Message = { id: number; from: 'user' | 'bot'; text: string };

const CROPS = Object.keys(CROP_INFO);
const HISTORY = 6; // earlier messages sent along, so "and how much water?" follows the conversation

export function Chat() {
  const { t, language, farm, forecastPlace } = useApp();
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
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, from: 'bot', text: t.chat.intro.replace('{count}', String(CROPS.length)) },
  ]);
  const [waiting, setWaiting] = useState(false);
  // The farmer's last question ('' before the first), for the questions offered under the answer
  const lastQuestion = [...messages].reverse().find((message) => message.from === 'user')?.text ?? '';
  const nextId = useRef(1);
  const list = useRef<HTMLDivElement>(null);
  // Goes up with each new chat, so an answer still on its way from an old chat is not added to the new one
  const conversation = useRef(0);

  // Always show the newest message
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages, waiting]);

  function addMessage(from: Message['from'], text: string) {
    const id = nextId.current++;
    setMessages((old) => [...old, { id, from, text }]);
  }

  // "New chat": asks first, then empties the chat (the crop goes back to the best crop of the last result)
  function newChat() {
    if (!window.confirm(`${t.chat.newChatTitle}\n${t.chat.newChatMessage}`)) {
      return;
    }
    conversation.current += 1;
    setMessages([{ id: 0, from: 'bot', text: t.chat.intro.replace('{count}', String(CROPS.length)) }]);
    setInput('');
    setWaiting(false);
    setCrop(bestCrop && CROP_INFO[bestCrop] ? bestCrop : null);
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
    const thisChat = conversation.current;
    setInput('');
    addMessage('user', question);

    // The app's own checked answer comes first. Only when it cannot answer (a detail or crop its facts do not
    // cover, a question it cannot read) is the AI on our server asked. If that cannot answer safely (no key,
    // limit reached, offline, a number not in the facts, a chemical dose), the app's own answer is shown instead.
    let answer = reply.text;
    let answerCrop = reply.crop;
    // "Today's weather?": the forecast for the place of the weather card on Home (without a place, the reply
    // asks the farmer to give one there)
    if (reply.weather && forecastPlace) {
      setWaiting(true);
      try {
        const weather = await api<WeatherNow>(`/weather/now?${forecastPlace.query}`);
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

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    ask(input);
  }

  // On a wide screen: the crops on the left, the conversation on the right. On a phone the crops are a row above it.
  return (
    <div className="chat-layout">
      <aside className="chat-side" aria-label={webText[language].chat.cropsTitle}>
        <p className="chat-side-title">{webText[language].chat.cropsTitle}</p>
        <div className="chat-crops">
          {CROPS.map((name) => (
            <button
              key={name}
              type="button"
              className={name === crop ? 'chat-crop chat-crop-selected' : 'chat-crop'}
              aria-pressed={name === crop}
              onClick={() => ask(cropName(name, language), name)}>
              {cropName(name, language)}
            </button>
          ))}
        </div>
      </aside>

    <section className="chat-page" aria-label={t.chat.title}>
      <div className="chat-title">
        <img src="/chatbot.png" alt="" className="chat-logo" />
        <strong>{t.chat.title}</strong>
        {messages.length > 1 && (
          <button type="button" className="link-button" onClick={newChat}>
            {t.chat.newChat}
          </button>
        )}
      </div>

      <div className="chat-messages" ref={list} aria-live="polite">
        {messages.map((message) => (
          <p key={message.id} className={message.from === 'user' ? 'message message-mine' : 'message'}>
            {message.text}
          </p>
        ))}
        {waiting ? (
          <p className="row note">
            <Spinner /> {t.chat.thinking}
          </p>
        ) : (
          // Questions to ask next, under the last answer (the app answers each of them itself)
          <div className="follow-ups">
            {followUpQuestions(lastQuestion, crop, replyLanguage(lastQuestion, language), farm).map((question) => (
              <button key={question} type="button" className="follow-up" onClick={() => ask(question)}>
                {question}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="chat-bottom">
        <form className="chat-form" onSubmit={onSubmit}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.chat.placeholder} maxLength={500} aria-label={t.chat.placeholder} />
          <button type="submit" className="button button-primary">
            {t.chat.send}
          </button>
        </form>
      </div>
    </section>
    </div>
  );
}
