const express = require('express');
const pool = require('../db');
const { requireUser } = require('../auth');

// The farmer's past chats with the crop helper (the list on the chat's side, like ChatGPT). The app answers in the
// chat itself (lib/chatbot.ts, and POST /chat for the AI); here it only saves each question with its answer, and
// loads the list and a chat again. A farmer only ever sees their own chats.
const router = express.Router();

const MAX_CHATS = 50; // per farmer: a new chat past this removes the oldest
const MAX_MESSAGES = 200; // per chat
const MAX_TEXT = 4000; // letters in one message
const MAX_TITLE = 80;

// [{ from: 'user' | 'bot', text, general? }, ...]: 1 to 10 messages (a question and its answer at a time)
function readMessages(messages) {
  const valid =
    Array.isArray(messages) &&
    messages.length >= 1 &&
    messages.length <= 10 &&
    messages.every(
      (m) =>
        m &&
        (m.from === 'user' || m.from === 'bot') &&
        typeof m.text === 'string' &&
        m.text.trim().length > 0 &&
        m.text.length <= MAX_TEXT &&
        (m.general === undefined || typeof m.general === 'boolean')
    );
  return valid ? messages : null;
}

async function saveMessages(chatId, messages) {
  for (const m of messages) {
    await pool.query('INSERT INTO chat_messages (chat_id, sender, text, general) VALUES ($1, $2, $3, $4)', [
      chatId,
      m.from,
      m.text.trim(),
      m.general === true,
    ]);
  }
  await pool.query('UPDATE chats SET updated_at = now() WHERE id = $1', [chatId]);
}

// The farmer's own chat, or null
async function ownChat(req) {
  if (!/^\d{1,18}$/.test(req.params.id)) {
    return null;
  }
  const chat = await pool.query('SELECT id FROM chats WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  return chat.rows[0] ?? null;
}

// GET /chats -> { chats: [{ id, title, updated_at }] }, newest first
router.get('/', requireUser, async (req, res) => {
  const chats = await pool.query('SELECT id, title, updated_at FROM chats WHERE user_id = $1 ORDER BY updated_at DESC, id DESC', [
    req.user.id,
  ]);
  res.json({ chats: chats.rows });
});

// POST /chats   Body: { "messages": [{ "from": "user", "text": "..." }, { "from": "bot", "text": "...", "general": false }] }
// -> { chat: { id, title, updated_at } }. A new chat, named after its first question.
router.post('/', requireUser, async (req, res) => {
  const messages = readMessages(req.body?.messages);
  if (!messages) {
    return res.status(400).json({ error: 'chat_invalid' });
  }
  const first = (messages.find((m) => m.from === 'user') ?? messages[0]).text.trim().replace(/\s+/g, ' ');
  const title = first.length > MAX_TITLE ? first.slice(0, MAX_TITLE - 1) + '…' : first;
  const chat = await pool.query('INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING id, title, updated_at', [
    req.user.id,
    title,
  ]);
  await saveMessages(chat.rows[0].id, messages);
  // Only the newest MAX_CHATS are kept; their messages go with them
  await pool.query(
    `DELETE FROM chats WHERE id IN (SELECT id FROM chats WHERE user_id = $1 ORDER BY updated_at DESC, id DESC OFFSET $2)`,
    [req.user.id, MAX_CHATS]
  );
  res.status(201).json({ chat: chat.rows[0] });
});

// GET /chats/12 -> { chat: { id, title }, messages: [{ from, text, general }] }, oldest first
router.get('/:id', requireUser, async (req, res) => {
  const chat = await ownChat(req);
  if (!chat) {
    return res.status(404).json({ error: 'chat_not_found' });
  }
  const details = await pool.query('SELECT id, title FROM chats WHERE id = $1', [chat.id]);
  const messages = await pool.query('SELECT sender AS "from", text, general FROM chat_messages WHERE chat_id = $1 ORDER BY id', [
    chat.id,
  ]);
  res.json({ chat: details.rows[0], messages: messages.rows });
});

// POST /chats/12/messages   Body: { "messages": [...] } (as above) -> { saved: true }
router.post('/:id/messages', requireUser, async (req, res) => {
  const messages = readMessages(req.body?.messages);
  if (!messages) {
    return res.status(400).json({ error: 'chat_invalid' });
  }
  const chat = await ownChat(req);
  if (!chat) {
    return res.status(404).json({ error: 'chat_not_found' });
  }
  const count = await pool.query('SELECT count(*)::int AS n FROM chat_messages WHERE chat_id = $1', [chat.id]);
  if (count.rows[0].n + messages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: 'chat_full' });
  }
  await saveMessages(chat.id, messages);
  res.json({ saved: true });
});

// DELETE /chats/12 -> { deleted: true }
router.delete('/:id', requireUser, async (req, res) => {
  const chat = await ownChat(req);
  if (!chat) {
    return res.status(404).json({ error: 'chat_not_found' });
  }
  await pool.query('DELETE FROM chats WHERE id = $1', [chat.id]);
  res.json({ deleted: true });
});

module.exports = router;
