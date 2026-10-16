// Sends a one-time code by SMS through 2Factor (2factor.in). 2Factor sends it with its own approved OTP message,
// so no DLT registration of our own is needed.
//
// Without TWOFACTOR_API_KEY in .env no SMS is sent: the code is printed in the backend's window instead, so
// "Create account" and "Forgot password" can be tested for free. Throws when 2Factor does not send it.

const ATTEMPT_MS = 15000; // 2Factor answers in about a second

async function sendCodeSms(phone, code) {
  const key = process.env.TWOFACTOR_API_KEY;
  if (!key) {
    console.log(`[No TWOFACTOR_API_KEY, so no SMS was sent] Code for ${phone}: ${code}`);
    return;
  }

  // The number with India's 91 in front. TWOFACTOR_TEMPLATE: the name of an OTP message of your own approved in
  // the 2Factor dashboard; empty means 2Factor's standard one.
  const template = process.env.TWOFACTOR_TEMPLATE ? `/${encodeURIComponent(process.env.TWOFACTOR_TEMPLATE)}` : '';
  const url = `https://2factor.in/API/V1/${encodeURIComponent(key)}/SMS/91${phone}/${code}${template}`;
  const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(ATTEMPT_MS) });
  const data = await response.json().catch(() => ({}));

  // { "Status": "Success", "Details": "<session id>" }, or "Error" and the reason (the key is never in the message)
  if (!response.ok || data.Status !== 'Success') {
    throw new Error(`2Factor did not send the SMS (status ${response.status}): ${data.Details ?? 'no reason given'}`);
  }
}

module.exports = { sendCodeSms };
