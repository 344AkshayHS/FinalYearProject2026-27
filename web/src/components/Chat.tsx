// The crop helper chat: a button at the bottom left opens a chat box. Same rules as
// frontend/src/app/chat.tsx on the phone, using the same answer rules (frontend/src/lib/chatbot.ts).

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Chip, Spinner } from '~/components/ui';
import { api } from '~/lib/api';
import { useApp } from '~/lib/app-context';
import { allCropFacts, answerQuestion, HELP_CONTACTS, replyLanguage } from '@/lib/chatbot';
import { CROP_INFO } from '@/lib/crop-info';
import { normaliseQuestion } from '@/lib/farmer-words';
import { cropName, translations } from '@/lib/translations';

type Message = { id: number; from: 'user' | 'bot'; text: string };

const CROPS = Object.keys(CROP_INFO);
const HISTORY = 6; // earlier messages sent along, so "and how much water?" follows the conversation

function ChatBox({ startCrop, onClose }: { startCrop: string | null; onClose: () => void }) {
  const { t, language, farm } = useApp();
  const [crop, setCrop] = useState<string | null>(startCrop);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, from: 'bot', text: t.chat.intro.replace('{count}', String(CROPS.length)) },
  ]);
  const [waiting, setWaiting] = useState(false);
  const nextId = useRef(1);
  const list = useRef<HTMLDivElement>(null);

  // Always show the newest message
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages, waiting]);

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
    // cover, a question it cannot read) is the AI on our server asked. If that cannot answer safely (no key,
    // limit reached, offline, a number not in the facts, a chemical dose), the app's own answer is shown instead.
    let answer = reply.text;
    let answerCrop = reply.crop;
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
    setCrop(answerCrop);
    addMessage('bot', answer);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    ask(input);
  }

  return (
    <div className="chat-box" role="dialog" aria-label={t.chat.title}>
      <div className="chat-title">
        <strong className="row">
          <img src="/chatbot.png" alt="" className="chat-logo" />
          {t.chat.title}
        </strong>
        <button type="button" className="link-button" onClick={onClose}>
          {t.close}
        </button>
      </div>

      <div className="chat-messages" ref={list} aria-live="polite">
        {messages.map((message) => (
          <p key={message.id} className={message.from === 'user' ? 'message message-mine' : 'message'}>
            {message.text}
          </p>
        ))}
        {waiting && (
          <p className="row note">
            <Spinner /> {t.chat.thinking}
          </p>
        )}
      </div>

      <div className="chat-bottom">
        {/* Quick questions about the current crop, then the list of crops to pick from */}
        <div className="chips chips-scroll">
          {crop && (
            <>
              <Chip label={t.chat.askName} onClick={() => ask(t.chat.askName)} />
              <Chip label={t.chat.askWater} onClick={() => ask(t.chat.askWater)} />
              <Chip label={t.chat.askTime} onClick={() => ask(t.chat.askTime)} />
            </>
          )}
          {CROPS.map((name) => (
            <Chip key={name} label={cropName(name, language)} selected={name === crop} onClick={() => ask(cropName(name, language), name)} />
          ))}
        </div>

        <form className="chat-form" onSubmit={onSubmit}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.chat.placeholder} maxLength={500} aria-label={t.chat.placeholder} />
          <button type="submit" className="button button-primary">
            {t.chat.send}
          </button>
        </form>
      </div>
    </div>
  );
}

export function Chat({ crop }: { crop?: string }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open && (
        <button type="button" className="chat-button" onClick={() => setOpen(true)}>
          <img src="/chatbot.png" alt="" className="chat-logo chat-logo-big" />
          {t.chat.short}
        </button>
      )}
      {/* Opened from a result: the chat starts about that crop. It starts fresh each time it is opened. */}
      {open && <ChatBox startCrop={crop && CROP_INFO[crop] ? crop : null} onClose={() => setOpen(false)} />}
    </>
  );
}
