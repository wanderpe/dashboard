import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function verifyMessengerSignature(rawBody, signature, appSecret) {
  if (!signature?.startsWith("sha256=") || !appSecret) return false;
  const supplied = Buffer.from(signature.slice(7), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function getMessengerTextEvents(payload, pageId) {
  if (!payload || payload.object !== "page" || !Array.isArray(payload.entry)) return [];
  const events = [];
  for (const entry of payload.entry) {
    if (String(entry?.id ?? "") !== pageId || !Array.isArray(entry.messaging)) continue;
    for (const event of entry.messaging) {
      const text = event?.message?.text;
      const senderId = event?.sender?.id;
      const recipientId = event?.recipient?.id;
      const messageId = event?.message?.mid;
      if (
        typeof text === "string" && text.trim() &&
        typeof senderId === "string" && senderId &&
        String(recipientId ?? "") === pageId &&
        typeof messageId === "string" && messageId &&
        !event?.message?.is_echo && !event?.message?.is_deleted
      ) {
        events.push({ senderId, pageId, messageId, text: text.trim() });
      }
    }
  }
  return events;
}

export function messengerSessionId(pageId, senderId) {
  const digest = createHash("sha256").update(`${pageId}:${senderId}`).digest("hex");
  return `messenger-${digest.slice(0, 40)}`;
}
