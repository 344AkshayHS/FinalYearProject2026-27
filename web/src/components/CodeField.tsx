// The code sent by SMS before an account is made and for "Forgot password", like the phone app's
// frontend/src/components/code-field.tsx: where the code went, the box for it, and "Send the code again".

import { useEffect, useState } from 'react';

import { TextField } from '~/components/ui';
import { api } from '~/lib/api';
import { useApp } from '~/lib/app-context';

// Asks the backend to send a code by SMS (backend/src/phone-codes.js). Answers when "Send the code again" may be
// pressed: the backend allows a new code 30 seconds after the last one. Throws ApiError like api().
export async function askForCode(path: '/users/register/code' | '/users/forgot-password/code', body: object) {
  const data = await api<{ resend_after: number }>(path, { method: 'POST', body });
  return Date.now() + data.resend_after * 1000;
}

type Props = {
  phone: string;
  value: string;
  onChange: (code: string) => void;
  canResendAt: number; // from askForCode
  onResend: () => void;
  busy: boolean; // a request is running: "Send the code again" waits
  notice: string | null; // e.g. "A new code was sent"
};

export function CodeField({ phone, value, onChange, canResendAt, onResend, busy, notice }: Props) {
  const { t } = useApp();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((canResendAt - now) / 1000));
  const shownPhone = `${phone.slice(0, 5)} ${phone.slice(5)}`;

  return (
    <>
      <p>{t.code.sentTo.replace('{phone}', shownPhone)}</p>
      {notice && (
        <p className="dark-text" role="status">
          <strong>{notice}</strong>
        </p>
      )}
      <TextField
        label={t.code.label}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        required
        autoFocus
      />
      {secondsLeft > 0 ? (
        <p className="note">{t.code.resendIn.replace('{s}', String(secondsLeft))}</p>
      ) : (
        <button type="button" className="link-button big-link" onClick={onResend} disabled={busy}>
          {t.code.resend}
        </button>
      )}
    </>
  );
}
