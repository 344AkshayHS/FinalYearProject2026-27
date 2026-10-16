-- Past chats with the crop helper, like ChatGPT's list on the side: each chat and its messages are kept with the
-- farmer's account, so they are still there after logging out or on a new phone. The app saves each question with
-- its answer (routes/chats.js). A farmer keeps at most 50 chats (the oldest goes) of at most 200 messages each.
-- Deleting a chat, or the account, deletes its messages. Safe to run twice. (new installs get this from schema.sql)
-- Apply with:  psql -U postgres -p 9999 -d greenroot -f backend/db/017_chats.sql

BEGIN;

CREATE TABLE IF NOT EXISTS chats (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title       TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),   -- the first question
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()    -- the last message: the list is newest first
);

CREATE INDEX IF NOT EXISTS chats_user_idx ON chats (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chat_id     BIGINT      NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
    sender      TEXT        NOT NULL CHECK (sender IN ('user', 'bot')),
    text        TEXT        NOT NULL CHECK (char_length(text) BETWEEN 1 AND 4000),
    general     BOOLEAN     NOT NULL DEFAULT false,   -- a general AI answer (the app marks it "please confirm")
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_chat_idx ON chat_messages (chat_id, id);

COMMIT;
