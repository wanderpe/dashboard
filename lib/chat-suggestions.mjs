const suggestions = [
  {
    id: "explain-concept",
    label: "Explain a concept",
    prompt: "Explain a technical concept in plain language, with a simple example.",
  },
  {
    id: "interpret-error",
    label: "Interpret an error",
    prompt: "Help me understand an error message I paste. Explain what it means and suggest safe next checks.",
  },
  {
    id: "plan-project",
    label: "Plan a project",
    prompt: "Help me plan a project. Ask about my goals, timeline, and constraints first.",
  },
];

export const CHAT_SUGGESTIONS = Object.freeze(
  suggestions.map((suggestion) => Object.freeze(suggestion)),
);

export function getChatSuggestionPrompt(id) {
  return CHAT_SUGGESTIONS.find((suggestion) => suggestion.id === id)?.prompt ?? null;
}

export function getChatSuggestionHref(id) {
  const prompt = getChatSuggestionPrompt(id);
  return prompt ? `/chat?q=${encodeURIComponent(prompt)}` : null;
}
