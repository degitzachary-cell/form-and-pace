// Message-thread helpers for session_logs + activities.
//
// New schema: each row carries a `messages` JSONB array of:
//   { id, author: 'athlete' | 'coach', body, created_at, read_at? }
//
// The legacy single coach_reply column still exists during the transition.
// `getThread` blends the legacy field into the array so the UI can render
// the same shape regardless of when the row was created.

import { newId } from "./helpers.js";

// Returns a chronologically-ordered list of messages for an item (session
// log or activity). Pulls in any legacy coach_reply as the first message
// (timestamped from the row's updated_at when available).
export function getThread(item) {
  const arr = Array.isArray(item?.messages) ? [...item.messages] : [];
  if (item?.coach_reply && !arr.some(m => m.author === "coach" && m.body === item.coach_reply)) {
    arr.unshift({
      id: `legacy-reply-${item.id || ""}`,
      author: "coach",
      body: item.coach_reply,
      created_at: item.updated_at || item.created_at || null,
      read_at: item.athlete_read_at || null,
      _legacy: true,
    });
  }
  arr.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  return arr;
}

// Append a new message to a thread. Returns the next messages array (does
// NOT mutate). `body` is trimmed; empty bodies return null so callers can
// short-circuit without a network round-trip.
export function appendMessage(prevMessages, { author, body }) {
  const trimmed = (body || "").trim();
  if (!trimmed) return null;
  const arr = Array.isArray(prevMessages) ? [...prevMessages] : [];
  arr.push({
    id: newId(),
    author,
    body: trimmed,
    created_at: new Date().toISOString(),
  });
  return arr;
}

// Mark all messages from `otherAuthor` as read by stamping read_at. Returns
// the next messages array, or the original reference if nothing changed.
export function markThreadRead(prevMessages, otherAuthor) {
  if (!Array.isArray(prevMessages)) return prevMessages;
  const now = new Date().toISOString();
  let mutated = false;
  const next = prevMessages.map(m => {
    if (m.author === otherAuthor && !m.read_at) { mutated = true; return { ...m, read_at: now }; }
    return m;
  });
  return mutated ? next : prevMessages;
}

// Count messages from the OTHER author that are unread by the current viewer.
// Used to flag "new reply" badges.
export function unreadCount(thread, viewerRole) {
  const otherAuthor = viewerRole === "coach" ? "athlete" : "coach";
  return (thread || []).filter(m => m.author === otherAuthor && !m.read_at).length;
}
