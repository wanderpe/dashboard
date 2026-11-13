import type { Metadata } from "next";

import { HermesChat } from "@/components/hermes-chat";

export const metadata: Metadata = {
  title: "Hermes Chat | Harvy's Home Lab",
  description: "Private browser-session chat with the local Hermes agent.",
};

export default function ChatPage() {
  return <HermesChat />;
}
