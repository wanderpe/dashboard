"use client";

import {
  CircleAlert,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MessageSquareText,
  Plus,
  RotateCcw,
  Send,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { signIn as authSignIn, signOut as authSignOut } from "next-auth/react";

import { CartmanAvatar } from "@/components/cartman-avatar";
import { AIChatMessage } from "@/components/ai-elements/chat-message";
import { TaskPlanTrace } from "@/components/ai-elements/plan";
import { TaskQueueTrace } from "@/components/ai-elements/queue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { CHAT_SUGGESTIONS, getChatSuggestionPrompt } from "@/lib/chat-suggestions.mjs";
import { parseCartmanWidgetContent } from "@/lib/cartman-widget-protocol.mjs";
import { mergeLocationContext, normalizeLocationContext } from "@/lib/location-context.mjs";
import type { LocationContext, LocationContextChangeHandler } from "@/lib/location-context-types";
import {
  normalizeTodoSnapshot,
  normalizeToolProgress,
  upsertTodoSnapshot,
  upsertToolProgressForMessage,
} from "@/lib/tool-progress.mjs";
import type { TodoSnapshot, ToolProgressStep } from "@/lib/tool-progress.mjs";
import { cn } from "@/lib/utils";

type ChatMode = "live" | "mock" | "unconfigured";
type AuthMode = "signin" | "register";
type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

function generateUUID(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type SessionState = {
  authenticated: boolean;
  configured?: boolean;
  chatMode: ChatMode;
  userId?: string | null;
  profile?: {
    displayName: string | null;
    username: string | null;
  } | null;
};

type RetryState = {
  content: string;
  requestId: string;
};

type ChatError = {
  message: string;
  retry?: RetryState;
};

type StreamChunk = {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
    finish_reason?: unknown;
  }>;
  error?: {
    message?: unknown;
  };
  hermes?: {
    error?: unknown;
  };
  label?: unknown;
  status?: unknown;
  tool?: unknown;
  tool_name?: unknown;
  toolCallId?: unknown;
  tool_call_id?: unknown;
};

const SESSION_ID_KEY = "harvy-hermes-session-id";
const MESSAGE_HISTORY_KEY = "harvy-hermes-message-history";
const LOCATION_CONTEXT_KEY = "harvy-hermes-location-context";
const MAX_STORED_MESSAGES = 80;

function newConversationId() {
  return `dashboard-${generateUUID()}`;
}

function newTurnId() {
  return `turn-${generateUUID()}`;
}

function readStoredMessages() {
  try {
    const value = sessionStorage.getItem(MESSAGE_HISTORY_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (entry): entry is ChatMessage =>
          !!entry &&
          typeof entry === "object" &&
          "id" in entry &&
          typeof entry.id === "string" &&
          "role" in entry &&
          (entry.role === "user" || entry.role === "assistant") &&
          "content" in entry &&
          typeof entry.content === "string" &&
          entry.content.length > 0,
      )
      .slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

function readStoredLocationContext(): LocationContext | null {
  try {
    const value = sessionStorage.getItem(LOCATION_CONTEXT_KEY);
    const parsed: unknown = value ? JSON.parse(value) : null;
    return normalizeLocationContext(parsed) as LocationContext | null;
  } catch {
    return null;
  }
}

function getErrorMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const error = "error" in value ? value.error : undefined;
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return fallback;
}

function parseSseBlock(block: string) {
  let event = "message";
  const data: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).trimStart());
    }
  }

  return { event, data: data.join("\n") };
}

function modeCopy(mode: ChatMode) {
  switch (mode) {
    case "live":
      return {
        label: "Available",
        description: "Ask a question or paste an error.",
        className: "border-[#c8ddd2] bg-[#edf5f0] text-[#31634f]",
      };
    case "mock":
      return {
        label: "Preview",
        description: "Replies are samples in preview mode.",
        className: "border-[#ead9a7] bg-[#faf4df] text-[#755d20]",
      };
    default:
      return {
        label: "Unavailable",
        description: "Chat is temporarily unavailable. Try again later.",
        className: "border-[#e9c9c7] bg-[#fbefee] text-[#8a3832]",
      };
  }
}

export function HermesChat() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [authName, setAuthName] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [locationContext, setLocationContext] = useState<LocationContext | null>(null);
  const [composer, setComposer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeAssistantMessageId, setActiveAssistantMessageId] =
    useState<string | null>(null);
  const [toolStepsByMessageId, setToolStepsByMessageId] = useState<
    Map<string, ToolProgressStep[]>
  >(() => new Map());
  const [todoSnapshot, setTodoSnapshot] = useState<TodoSnapshot | null>(null);
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const latestLocationWidgetMessageIdRef = useRef<string | null>(null);
  const latestLocationWidgetMessageId = [...messages].reverse().find((message) =>
    message.role === "assistant" &&
    parseCartmanWidgetContent(message.content).some((part) => part.type === "widget"),
  )?.id ?? null;
  useLayoutEffect(() => {
    latestLocationWidgetMessageIdRef.current = latestLocationWidgetMessageId;
  }, [latestLocationWidgetMessageId]);

  const handleLocationContextChange = useCallback<LocationContextChangeHandler>((messageId, update) => {
    if (messageId !== latestLocationWidgetMessageIdRef.current) return;
    setLocationContext((current) => mergeLocationContext(current, update) as LocationContext | null);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Could not check authentication.");
        }

        const value = (await response.json()) as SessionState;
        if (active) {
          setSession(value);
        }
      } catch (error) {
        if (active) {
          setSessionError(
            error instanceof Error ? error.message : "Could not check authentication.",
          );
        }
      }
    }

    let storedId = sessionStorage.getItem(SESSION_ID_KEY) ?? "";
    if (!storedId.startsWith("dashboard-")) {
      storedId = newConversationId();
      sessionStorage.setItem(SESSION_ID_KEY, storedId);
    }

    queueMicrotask(() => {
      if (!active) {
        return;
      }

      setConversationId(storedId);
      setMessages(readStoredMessages());
      setLocationContext(readStoredLocationContext());
      setStorageReady(true);

      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const queryParam = urlParams.get("q");
        if (queryParam) {
          setComposer(queryParam);
        }
      }
    });
    void loadSession();

    return () => {
      active = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    sessionStorage.setItem(
      MESSAGE_HISTORY_KEY,
      JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)),
    );
  }, [messages, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    if (locationContext) {
      sessionStorage.setItem(LOCATION_CONTEXT_KEY, JSON.stringify(locationContext));
    } else {
      sessionStorage.removeItem(LOCATION_CONTEXT_KEY);
    }
  }, [locationContext, storageReady]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthenticating(true);
    setAuthError("");

    const registering = authMode === "register";
    const payload = registering
      ? { name: authName, username: authUsername, email: authEmail, password: authPassword }
      : null;

    try {
      if (registering) {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const value: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(getErrorMessage(value, "Account creation failed."));
        }
      }

      const result = await authSignIn("credentials", {
        email: authEmail,
        password: authPassword,
        redirect: false,
      });
      if (!result.ok) {
        throw new Error(registering ? "Account created, but automatic sign-in failed. Please sign in." : "Email or password is incorrect.");
      }

      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const value: SessionState = await sessionResponse.json();
      if (!sessionResponse.ok || !value.authenticated) {
        throw new Error("Sign-in succeeded, but the dashboard session could not be verified.");
      }

      setAuthPassword("");
      sessionStorage.removeItem(MESSAGE_HISTORY_KEY);
      sessionStorage.removeItem(LOCATION_CONTEXT_KEY);
      setMessages([]);
      setLocationContext(null);
      setSession(value);
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : authMode === "register"
            ? "Account creation failed."
            : "Sign-in failed.",
      );
    } finally {
      setAuthenticating(false);
    }
  }

  async function signOut() {
    abortControllerRef.current?.abort();
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    await authSignOut({ redirect: false });
    setSession((current) =>
      current ? { ...current, authenticated: false } : current,
    );
    setAuthError("");
    sessionStorage.removeItem(MESSAGE_HISTORY_KEY);
    sessionStorage.removeItem(LOCATION_CONTEXT_KEY);
    setMessages([]);
    setLocationContext(null);
    setChatError(null);
    setToolStepsByMessageId(new Map());
    setActiveAssistantMessageId(null);
    setTodoSnapshot(null);
    setStreaming(false);
  }

  function startNewConversation() {
    abortControllerRef.current?.abort();
    const nextId = newConversationId();
    sessionStorage.setItem(SESSION_ID_KEY, nextId);
    sessionStorage.removeItem(MESSAGE_HISTORY_KEY);
    sessionStorage.removeItem(LOCATION_CONTEXT_KEY);
    setConversationId(nextId);
    setMessages([]);
    setLocationContext(null);
    setComposer("");
    setChatError(null);
    setToolStepsByMessageId(new Map());
    setActiveAssistantMessageId(null);
    setTodoSnapshot(null);
    setStreaming(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function updateAssistantMessage(messageId: string, content: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, content } : message,
      ),
    );
  }

  function removeMessage(messageId: string) {
    setMessages((current) =>
      current.filter((message) => message.id !== messageId),
    );
    setToolStepsByMessageId((current) => {
      const next = new Map(current);
      next.delete(messageId);
      return next;
    });
  }

  async function sendMessage(
    rawContent: string,
    options: {
      appendUser?: boolean;
      requestId?: string;
    } = {},
  ) {
    const content = rawContent.trim();
    const appendUser = options.appendUser ?? true;

    if (
      !content ||
      streaming ||
      !session?.authenticated ||
      session.chatMode === "unconfigured" ||
      !conversationId
    ) {
      return;
    }

    const requestId = options.requestId ?? newTurnId();
    const userMessage: ChatMessage = {
      id: generateUUID(),
      role: "user",
      content,
    };
    const assistantId = generateUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
    };

    setMessages((current) => [
      ...current,
      ...(appendUser ? [userMessage] : []),
      assistantMessage,
    ]);
    setComposer("");
    setStreaming(true);
    setActiveAssistantMessageId(assistantId);
    setTodoSnapshot(null);
    setChatError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let assistantText = "";
    let finishReason = "";
    let streamFailure = "";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content }],
          locationContext,
          sessionId: conversationId,
          requestId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const value: unknown = await response.json().catch(() => null);
        throw new Error(
          getErrorMessage(
            value,
            `Chat request failed with HTTP ${response.status}.`,
          ),
        );
      }

      if (!response.body) {
        throw new Error("Eric opened the request without a response stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneFrame = false;

      const processBlock = (block: string) => {
        const frame = parseSseBlock(block);
        if (!frame.data) {
          return;
        }

        if (frame.data === "[DONE]") {
          doneFrame = true;
          return;
        }

        let payload: StreamChunk;
        try {
          payload = JSON.parse(frame.data) as StreamChunk;
        } catch {
          return;
        }

        if (frame.event === "hermes.tool.progress") {
          const progress = normalizeToolProgress(payload);
          if (progress) {
            setToolStepsByMessageId((current) =>
              upsertToolProgressForMessage(current, assistantId, progress),
            );
          }
          return;
        }

        if (frame.event === "hermes.todo.updated") {
          const snapshot = normalizeTodoSnapshot(payload);
          if (snapshot) {
            setTodoSnapshot((current) => upsertTodoSnapshot(current, snapshot));
          }
          return;
        }

        if (frame.event === "hermes.status") {
          return;
        }

        const choice = payload.choices?.[0];
        const delta = choice?.delta?.content;
        if (typeof delta === "string" && delta) {
          assistantText += delta;
          updateAssistantMessage(assistantId, assistantText);
        }

        if (typeof choice?.finish_reason === "string") {
          finishReason = choice.finish_reason;
          if (finishReason === "error" || finishReason === "cancelled") {
            const payloadError = payload.error?.message;
            const hermesError = payload.hermes?.error;
            streamFailure =
              (typeof payloadError === "string" && payloadError) ||
              (typeof hermesError === "string" && hermesError) ||
              (finishReason === "cancelled"
                ? "Eric cancelled the reply."
                : "Eric could not complete the reply.");
          }
        }
      };

      while (!doneFrame) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          processBlock(block);
          if (doneFrame) {
            break;
          }
        }

        if (done) {
          if (buffer.trim()) {
            processBlock(buffer);
          }
          break;
        }
      }

      if (streamFailure) {
        throw new Error(streamFailure);
      }

      if (!assistantText.trim()) {
        throw new Error("Eric completed the stream without a reply.");
      }

      if (finishReason === "length") {
        setChatError({
          message:
            "Eric reached its iteration or output limit. The partial reply was kept in the conversation.",
        });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      if (!assistantText) {
        removeMessage(assistantId);
      }

      setChatError({
        message:
          error instanceof Error ? error.message : "The Hermes request failed.",
        retry: { content, requestId },
      });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setActiveAssistantMessageId(null);
        setStreaming(false);
      }
    }
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(composer);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
      return;
    }

    event.currentTarget.form?.requestSubmit();
  }

  function selectSuggestion(id: string) {
    const prompt = getChatSuggestionPrompt(id);
    if (!prompt) {
      return;
    }
    setComposer(prompt);
    textareaRef.current?.focus();
  }

  if (!session || !storageReady) {
    return (
      <main
        id="main-content"
        className="ambient-canvas cartman-chat-canvas flex min-h-[calc(100svh-56px)] items-center justify-center px-4 text-[#52636b] lg:min-h-svh"
      >
        <div className="flex items-center gap-3 text-sm text-[#52636b]">
          <LoaderCircle
            className="size-4 animate-spin text-[#ad342d]"
            aria-hidden="true"
          />
          Loading your chat…
        </div>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main
        id="main-content"
        className="ambient-canvas cartman-chat-canvas flex min-h-[calc(100svh-56px)] items-center justify-center px-4 lg:min-h-svh"
      >
        <div className="w-full max-w-lg rounded-md border border-[#e5c9c7] bg-white p-7 text-[#20313a]">
          <CircleAlert className="size-6 text-[#ad342d]" aria-hidden="true" />
          <h1 className="mt-4 font-heading text-2xl font-bold text-[#20313a]">
            Couldn’t check your session
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#5e7078]">
            {sessionError}
          </p>
          <Button
            type="button"
            variant="outline"
            className="tactile-button mt-6 min-h-11 rounded-md border-[#cbd7da] bg-white text-[#334b55] hover:bg-[#edf2f4]"
            onClick={() => window.location.reload()}
          >
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            Try again
          </Button>
        </div>
      </main>
    );
  }


  if (!session.authenticated) {
    const canSubmit = authMode === "register"
      ? Boolean(authName.trim() && authUsername.trim() && authEmail.trim() && authPassword.length >= 8)
      : Boolean(authEmail.trim() && authPassword.length >= 8);
    const title = authMode === "register"
      ? "Create your chat account"
      : "Sign in to Eric AI";
    const description = authMode === "register"
      ? "Create a private profile for your conversations."
      : "Sign in to continue with your private chat profile.";

    return (
      <main
        id="main-content"
        className="ambient-canvas cartman-chat-canvas flex min-h-[calc(100svh-56px)] items-center justify-center px-4 py-8 lg:min-h-svh"
      >
        <section className="w-full max-w-md rounded-md border border-[#d2dde0] bg-white p-6 text-[#20313a] sm:p-8">
          <div className="flex size-11 items-center justify-center rounded-md border border-[#d2dde0] bg-[#e7eef0] text-[#a6322c]">
            <LockKeyhole className="size-6" aria-hidden="true" />
          </div>
          <p className="mt-5 text-sm font-medium text-[#65767d]">
            Eric AI
          </p>
          <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight text-[#20313a]">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#5f7078]">{description}</p>

          <div className="mt-6 grid grid-cols-2 gap-1 border-b border-[#d2dde0] bg-[#f3f6f7] p-1" role="tablist" aria-label="Authentication options">
            <button
              type="button"
              role="tab"
              aria-selected={authMode === "register"}
              onClick={() => { setAuthMode("register"); setAuthError(""); }}
              className={cn(
                "min-h-11 rounded-md px-2 text-sm font-medium transition-colors",
                authMode === "register" ? "bg-[#203642] text-white" : "text-[#53666e] hover:bg-[#e7eef0] hover:text-[#20313a]",
              )}
            >
              Create account
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === "signin"}
              onClick={() => { setAuthMode("signin"); setAuthError(""); }}
              className={cn(
                "min-h-11 rounded-md px-2 text-sm font-medium",
                authMode === "signin" ? "bg-[#203642] text-white" : "text-[#53666e] hover:bg-[#e7eef0] hover:text-[#20313a]",
              )}
            >
              Sign in
            </button>

          </div>

          <form className="mt-5 space-y-4" onSubmit={authenticate}>
            {authMode === "register" ? (
              <>
                <div>
                  <label htmlFor="auth-name" className="text-sm font-medium text-[#53666e]">Display name</label>
                  <input id="auth-name" type="text" value={authName} onChange={(event) => setAuthName(event.target.value)} autoComplete="name" required maxLength={80} className="mt-2 min-h-11 w-full rounded-md border border-[#cbd7da] bg-white px-3 text-base text-[#20313a] outline-none placeholder:text-[#829097] focus-visible:border-[#ad342d] focus-visible:ring-2 focus-visible:ring-[#ad342d]/20" placeholder="How should Eric address you?" />
                </div>
                <div>
                  <label htmlFor="auth-username" className="text-sm font-medium text-[#53666e]">Username</label>
                  <input id="auth-username" type="text" value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} autoComplete="username" required maxLength={40} className="mt-2 min-h-11 w-full rounded-md border border-[#cbd7da] bg-white px-3 text-base text-[#20313a] outline-none placeholder:text-[#829097] focus-visible:border-[#ad342d] focus-visible:ring-2 focus-visible:ring-[#ad342d]/20" placeholder="Choose a username" />
                </div>
              </>
            ) : null}

            {true ? (
              <>
                <div>
                  <label htmlFor="auth-email" className="text-sm font-medium text-[#53666e]">Email</label>
                  <input id="auth-email" type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} autoComplete="email" required className="mt-2 min-h-11 w-full rounded-md border border-[#cbd7da] bg-white px-3 text-base text-[#20313a] outline-none placeholder:text-[#829097] focus-visible:border-[#ad342d] focus-visible:ring-2 focus-visible:ring-[#ad342d]/20" placeholder="you@example.com" />
                </div>
                <div>
                  <label htmlFor="auth-password" className="text-sm font-medium text-[#53666e]">Password</label>
                  <input id="auth-password" type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} autoComplete={authMode === "register" ? "new-password" : "current-password"} required minLength={8} maxLength={256} className="mt-2 min-h-11 w-full rounded-md border border-[#cbd7da] bg-white px-3 text-base text-[#20313a] outline-none placeholder:text-[#829097] focus-visible:border-[#ad342d] focus-visible:ring-2 focus-visible:ring-[#ad342d]/20" placeholder="At least 8 characters" />
                </div>
              </>
            ) : null}

            {authError ? (
              <p role="alert" className="rounded-md border border-[#e5c9c7] bg-[#fbefee] px-3 py-2 text-sm leading-6 text-[#7c342f]">{authError}</p>
            ) : null}
            <Button
              type="submit"
              className="min-h-11 w-full rounded-md bg-[#ad342d] text-white hover:bg-[#922a24] focus-visible:ring-[#ad342d]/40"
              disabled={authenticating || !canSubmit}
            >
              {authenticating ? <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : <LockKeyhole data-icon="inline-start" aria-hidden="true" />}
              {authenticating ? "Please wait…" : authMode === "register" ? "Create account" : "Sign in"}
            </Button>
          </form>
        </section>
      </main>
    );
  }

  const mode = modeCopy(session.chatMode);
  const composerDisabled = streaming || session.chatMode === "unconfigured";

  return (
    <main
      id="main-content"
      className="ambient-canvas cartman-chat-canvas grid h-[calc(100svh-56px)] min-h-[36rem] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden text-[#20313a] lg:h-svh"
    >
      <header className="relative z-10 border-b border-[#d2dde0] bg-[#f8fafb] px-4 py-3 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <CartmanAvatar className="size-11 shrink-0 rounded-full border border-[#c4d4d9] bg-[#dce8eb] object-contain" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-[#667880]">
                <MessageSquareText className="size-3.5" aria-hidden="true" />
                <span>Personal chat</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h1 className="font-heading text-2xl font-bold tracking-tight text-[#20313a] sm:text-3xl">
                  Eric
                </h1>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-md text-xs font-medium",
                    mode.className,
                  )}
                >
                  {mode.label}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-[#64747b]">{mode.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="tactile-button min-h-11 rounded-md border-[#cbd7da] bg-white text-[#344a54] hover:bg-[#edf2f4] hover:text-[#20313a] text-sm"
              onClick={startNewConversation}
            >
              <Plus
                className="size-3.5"
                data-icon="inline-start"
                aria-hidden="true"
              />
              New chat
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="tactile-button min-h-11 rounded-md text-[#5f7078] hover:bg-[#e9eff1] hover:text-[#20313a] text-sm"
              onClick={() => void signOut()}
            >
              <LogOut
                className="size-3.5"
                data-icon="inline-start"
                aria-hidden="true"
              />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <section
        aria-label="Eric conversation"
        aria-busy={streaming}
        className="relative z-10 min-h-0 min-w-0"
      >
        <MessageScrollerProvider
          autoScroll={messages.length > 0}
          defaultScrollPosition={messages.length > 0 ? "end" : "start"}
          scrollPreviousItemPeek={56}
        >
          <MessageScroller className="h-full">
            <MessageScrollerViewport
              aria-label="Conversation messages"
              aria-busy={streaming}
              className="px-0"
            >
              <MessageScrollerContent className="mx-auto w-full max-w-5xl gap-6 px-4 py-7 sm:px-6 sm:py-8 lg:px-8">
                {messages.length === 0 ? (
                  <MessageScrollerItem className="my-auto w-full">
                    <div className="w-full py-3 sm:py-10">
                      <div className="max-w-3xl">
                        <h2 className="font-heading text-2xl font-bold leading-tight tracking-tight text-[#20313a] sm:text-3xl">
                          What are we working on?
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#53656d] sm:text-base sm:leading-7">
                          Ask a question, untangle an error, or plan a project. Eric only sees what you share in this chat.
                        </p>
                      </div>

                      <section className="mt-5 sm:mt-6" aria-label="Suggested prompts">
                        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                          <h3 className="text-sm font-semibold text-[#283b44]">Choose a starting point</h3>
                          <p className="text-xs text-[#718087]">Select one to prefill</p>
                        </div>
                        <div className="flex flex-col gap-1">
                          {CHAT_SUGGESTIONS.map((suggestion) => (
                            <Button
                              key={suggestion.id}
                              type="button"
                              variant="ghost"
                              className="h-auto min-h-11 w-full flex-col items-start justify-center gap-0 whitespace-normal rounded-md border border-transparent px-3 py-2 text-left text-[#263943] shadow-none transition-[translate,box-shadow,border-color,background-color] motion-safe:hover:-translate-y-0.5 hover:border-[#bcaaa3] hover:bg-[#f6f8f9] hover:text-[#20313a] hover:shadow-[0_12px_24px_-18px_rgba(32,54,66,0.22)] focus-visible:ring-2 focus-visible:ring-[#ad342d]/30"
                              onClick={() => selectSuggestion(suggestion.id)}
                              disabled={composerDisabled}
                              aria-label={`Use prompt: ${suggestion.label}`}
                            >
                              <span className="block w-full text-sm font-semibold text-[#263943]">
                                {suggestion.label}
                              </span>
                              <span className="mt-1 block w-full text-xs font-normal leading-5 text-[#63727a]">
                                {suggestion.prompt}
                              </span>
                            </Button>
                          ))}
                        </div>
                        <p className="mt-3 text-xs text-[#718087]">
                          Prompts fill the composer. Nothing sends until you choose Send.
                        </p>
                      </section>
                    </div>
                  </MessageScrollerItem>
                ) : (
                  messages.map((message) => (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={message.id}
                      scrollAnchor={message.role === "user"}
                      className="w-full"
                    >
                      <AIChatMessage
                        message={message}
                        userName={session.profile?.displayName ?? "You"}
                        toolSteps={toolStepsByMessageId.get(message.id) ?? []}
                        onLocationContextChange={handleLocationContextChange}
                        streaming={
                          streaming && activeAssistantMessageId === message.id
                        }
                      />
                    </MessageScrollerItem>
                  ))
                )}

                {todoSnapshot?.todos.length ? (
                  <MessageScrollerItem className="w-full">
                    <div className="space-y-3">
                      <TaskPlanTrace snapshot={todoSnapshot} streaming={streaming} />
                      <TaskQueueTrace snapshot={todoSnapshot} streaming={streaming} />
                    </div>
                  </MessageScrollerItem>
                ) : null}

                {chatError ? (
                  <MessageScrollerItem className="w-full">
                    <div
                      role="alert"
                      className="rounded-md border border-[#e5c9c7] bg-[#fbefee] p-4 text-[#7c342f]"
                    >
                      <div className="flex items-start gap-3">
                        <CircleAlert
                          className="mt-0.5 size-4 shrink-0 text-[#ad342d]"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-relaxed">{chatError.message}</p>
                          {chatError.retry ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="tactile-button mt-3 min-h-11 rounded-md border-[#d9b8b5] bg-white text-[#7c342f] hover:bg-[#f8e5e3]"
                              disabled={streaming}
                              onClick={() =>
                                void sendMessage(chatError.retry!.content, {
                                  appendUser: false,
                                  requestId: chatError.retry!.requestId,
                                })
                              }
                            >
                              <RotateCcw data-icon="inline-start" aria-hidden="true" />
                              Retry Request
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </MessageScrollerItem>
                ) : null}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            {messages.length > 0 ? (
              <MessageScrollerButton className="border-[#cbd7da] bg-white text-[#334b55] shadow-sm hover:bg-[#edf2f4]" />
            ) : null}
          </MessageScroller>
        </MessageScrollerProvider>
      </section>

      <div className="relative z-10 border-t border-[#d2dde0] bg-[#f8fafb]/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <form className="mx-auto w-full max-w-5xl" onSubmit={submitMessage}>
          <label htmlFor="chat-composer" className="sr-only">
            Message Eric
          </label>
          <InputGroup className="h-auto min-h-[4.5rem] items-end gap-3 rounded-2xl border-[#c4d1d6] bg-white p-2.5 shadow-[0_8px_30px_-22px_rgba(32,54,66,0.42)] focus-within:border-[#ad342d] focus-within:ring-4 focus-within:ring-[#ad342d]/10">
            <InputGroupTextarea
              ref={textareaRef}
              id="chat-composer"
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              rows={2}
              maxLength={16_000}
              disabled={composerDisabled}
              placeholder={
                session.chatMode === "unconfigured"
                  ? "Assistant is temporarily unavailable. Please try again later."
                  : "Ask Eric anything…"
              }
              className="max-h-40 min-h-12 w-full px-2.5 py-1 text-base leading-relaxed text-[#20313a] outline-none placeholder:text-[#829097] disabled:cursor-not-allowed disabled:opacity-55"
            />
            <Button
              type="submit"
              className="tactile-button focus-ring-glow min-h-11 shrink-0 rounded-xl bg-[#ad342d] px-5 text-sm font-semibold text-white hover:bg-[#922a24] disabled:bg-[#d7e0e2] disabled:text-[#536870] disabled:opacity-100"
              disabled={composerDisabled || !composer.trim()}
            >
              {streaming ? (
                <LoaderCircle
                  className="animate-spin size-3.5"
                  data-icon="inline-start"
                  aria-hidden="true"
                />
              ) : (
                <Send
                  className="size-3.5"
                  data-icon="inline-start"
                  aria-hidden="true"
                />
              )}
              {streaming ? "Thinking..." : "Send"}
            </Button>
          </InputGroup>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#718087]">
            <span>Web search is automatic when useful; search terms may go to external providers. Avoid secrets.</span>
            <span className="ml-auto">
              Enter to send · Shift+Enter for a new line
            </span>
          </div>
        </form>
      </div>
    </main>
  );
}
