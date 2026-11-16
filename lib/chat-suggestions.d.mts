export type ChatSuggestion = {
  id: string;
  label: string;
  prompt: string;
};

export const CHAT_SUGGESTIONS: readonly ChatSuggestion[];
export function getChatSuggestionPrompt(id: string): string | null;
export function getChatSuggestionHref(id: string): string | null;
