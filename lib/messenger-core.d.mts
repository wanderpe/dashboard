export type MessengerTextEvent = {
  senderId: string;
  pageId: string;
  messageId: string;
  text: string;
};

export function verifyMessengerSignature(
  rawBody: string | Buffer,
  signature: string,
  appSecret: string,
): boolean;

export function getMessengerTextEvents(
  payload: unknown,
  pageId: string,
): MessengerTextEvent[];

export function messengerSessionId(pageId: string, senderId: string): string;
