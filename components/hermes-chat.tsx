"use client";

import {
  Bot,
  CircleAlert,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MessageSquareText,
  Plus,
  RotateCcw,
  Send,
  UserRound,
  Wrench,
} from "lucide-react";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatMode = "live" | "mock" | "unconfigured";
type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type SessionState = {
  authenticated: boolean;
  configured: boolean;
  chatMode: ChatMode;
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
};

const SESSION_ID_KEY = "harvy-hermes-session-id";
const MESSAGE_HISTORY_KEY = "harvy-hermes-message-history";
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
        label: "API configured",
        description: "Replies are forwarded to the local Hermes API.",
        className: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
      };
    case "mock":
      return {
        label: "Mock mode",
        description: "Streaming UI verification is using the local mock response.",
        className: "border-amber-300/30 bg-amber-300/10 text-amber-100",
      };
    default:
      return {
        label: "API not configured",
        description: "Add HERMES_API_KEY to the dashboard server environment.",
        className: "border-rose-300/30 bg-rose-300/10 text-rose-100",
      };
  }
}

export function HermesChat() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [ownerToken, setOwnerToken] = useState("");
  const [authError, setAuthError] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activity, setActivity] = useState("");
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Could not check owner access.");
        }

        const value = (await response.json()) as SessionState;
        if (active) {
          setSession(value);
        }
      } catch (error) {
        if (active) {
          setSessionError(
            error instanceof Error ? error.message : "Could not check owner access.",
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
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, activity]);

  useEffect(() => {
    if (session?.authenticated) {
      textareaRef.current?.focus();
    }
  }, [session?.authenticated]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthenticating(true);
    setAuthError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerToken }),
      });
      const value: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getErrorMessage(value, "Owner authentication failed."));
      }

      setOwnerToken("");
      setSession((current) =>
        current ? { ...current, authenticated: true } : current,
      );
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Owner authentication failed.",
      );
    } finally {
      setAuthenticating(false);
    }
  }

  async function signOut() {
    abortControllerRef.current?.abort();
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setSession((current) =>
      current ? { ...current, authenticated: false } : current,
    );
    setAuthError("");
    setChatError(null);
    setActivity("");
    setStreaming(false);
  }

  function startNewConversation() {
    abortControllerRef.current?.abort();
    const nextId = newConversationId();
    sessionStorage.setItem(SESSION_ID_KEY, nextId);
    sessionStorage.removeItem(MESSAGE_HISTORY_KEY);
    setConversationId(nextId);
    setMessages([]);
    setComposer("");
    setChatError(null);
    setActivity("");
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
  }

  async function sendMessage(
    rawContent: string,
    options: { appendUser?: boolean; requestId?: string } = {},
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
    setActivity("Connecting to Hermes…");
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
          sessionId: conversationId,
          requestId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const value: unknown = await response.json().catch(() => null);
        throw new Error(getErrorMessage(value, `Chat request failed with HTTP ${response.status}.`));
      }

      if (!response.body) {
        throw new Error("Hermes opened the request without a response stream.");
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
          const label = typeof payload.label === "string" ? payload.label : "Using a tool";
          const status = typeof payload.status === "string" ? payload.status : "";
          setActivity(status === "completed" ? "Processing tool result…" : label);
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
          setActivity("Streaming reply…");
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
                ? "Hermes cancelled the reply."
                : "Hermes could not complete the reply.");
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
        throw new Error("Hermes completed the stream without a reply.");
      }

      if (finishReason === "length") {
        setChatError({
          message:
            "Hermes reached its iteration or output limit. The partial reply was kept in the conversation.",
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
        message: error instanceof Error ? error.message : "The Hermes request failed.",
        retry: { content, requestId },
      });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setActivity("");
      setStreaming(false);
    }
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(composer);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  if (!session || !storageReady) {
    return (
      <main
        id="main-content"
        className="ambient-canvas flex min-h-[calc(100svh-61px)] items-center justify-center px-4 lg:min-h-svh"
      >
        <div className="flex items-center gap-3 font-mono text-xs tracking-wider text-cyan-300 uppercase">
          <LoaderCircle className="size-4 animate-spin text-cyan-400" aria-hidden="true" />
          Connecting to Hermes Assistant...
        </div>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main
        id="main-content"
        className="ambient-canvas flex min-h-[calc(100svh-61px)] items-center justify-center px-4 lg:min-h-svh"
      >
        <div className="glass-panel w-full max-w-lg rounded-2xl border-rose-500/30 p-8 text-rose-50 shadow-2xl">
          <CircleAlert className="size-6 text-rose-400" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-white">Owner Access Check Failed</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">{sessionError}</p>
          <Button
            type="button"
            variant="outline"
            className="tactile-button mt-6 min-h-10 rounded-xl border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
            onClick={() => window.location.reload()}
          >
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            Retry Connection
          </Button>
        </div>
      </main>
    );
  }

  if (!session.configured) {
    return (
      <main
        id="main-content"
        className="ambient-canvas flex min-h-[calc(100svh-61px)] items-center justify-center px-4 py-8 lg:min-h-svh"
      >
        <section className="glass-panel w-full max-w-xl rounded-2xl border-amber-500/30 p-8 text-zinc-100 shadow-2xl">
          <div className="flex size-12 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
            <KeyRound className="size-6" aria-hidden="true" />
          </div>
          <span className="mt-6 inline-block font-mono text-xs font-medium tracking-wider text-amber-400 uppercase">
            Configuration Required
          </span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Owner Access Is Not Configured
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            Set a private <code className="font-mono text-cyan-300 px-1 py-0.5 rounded bg-white/5 border border-white/10">DASHBOARD_OWNER_TOKEN</code> in
            your server environment, then restart the dashboard container.
          </p>
        </section>
      </main>
    );
  }

  if (!session.authenticated) {
    return (
      <main
        id="main-content"
        className="ambient-canvas flex min-h-[calc(100svh-61px)] items-center justify-center px-4 py-8 lg:min-h-svh"
      >
        <section className="glass-panel w-full max-w-md rounded-2xl border-white/10 p-8 text-zinc-100 shadow-2xl">
          <div className="flex size-12 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
            <LockKeyhole className="size-6" aria-hidden="true" />
          </div>
          <span className="mt-6 inline-block font-mono text-xs font-medium tracking-wider text-cyan-400 uppercase">
            Private Channel &middot; Owner Authentication
          </span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Unlock Hermes Assistant
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Enter the private dashboard owner token to establish a secured session cookie.
          </p>

          <form className="mt-6" onSubmit={authenticate}>
            <label
              htmlFor="owner-token"
              className="font-mono text-xs font-medium tracking-wider text-zinc-400 uppercase"
            >
              Owner Token
            </label>
            <input
              id="owner-token"
              type="password"
              value={ownerToken}
              onChange={(event) => setOwnerToken(event.target.value)}
              autoComplete="current-password"
              required
              minLength={24}
              className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 text-sm text-white outline-none placeholder:text-zinc-500 focus-ring-glow"
              placeholder="Paste owner token (min 24 characters)"
            />
            {authError ? (
              <p role="alert" className="mt-3 text-xs leading-relaxed text-rose-400">
                {authError}
              </p>
            ) : null}
            <Button
              type="submit"
              className="tactile-button focus-ring-glow mt-5 min-h-11 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-semibold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500"
              disabled={authenticating || ownerToken.length < 24}
            >
              {authenticating ? (
                <LoaderCircle className="animate-spin size-4" data-icon="inline-start" aria-hidden="true" />
              ) : (
                <LockKeyhole className="size-4" data-icon="inline-start" aria-hidden="true" />
              )}
              {authenticating ? "Authenticating..." : "Unlock Assistant"}
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
      className="ambient-canvas grid h-[calc(100svh-61px)] min-h-[36rem] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden lg:h-svh text-zinc-100"
    >
      <header className="relative z-10 border-b border-white/[0.08] bg-[#07090e]/85 backdrop-blur-xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-xs tracking-wider text-cyan-400 uppercase">
              <MessageSquareText className="size-3.5" aria-hidden="true" />
              <span>Hermes Agent Channel</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Hermes Assistant
              </h1>
              <Badge variant="outline" className={cn("rounded-md text-[10px] font-mono", mode.className)}>
                {mode.label}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-zinc-400">{mode.description}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="tactile-button rounded-xl border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08] hover:text-white text-xs"
              onClick={startNewConversation}
            >
              <Plus className="size-3.5" data-icon="inline-start" aria-hidden="true" />
              New Conversation
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="tactile-button rounded-xl text-zinc-400 hover:bg-white/[0.06] hover:text-white text-xs"
              onClick={() => void signOut()}
            >
              <LogOut className="size-3.5" data-icon="inline-start" aria-hidden="true" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <section
        aria-label="Hermes conversation"
        aria-busy={streaming}
        className="relative z-10 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
      >
        <div
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          className="mx-auto flex w-full max-w-5xl flex-col gap-5"
        >
          {messages.length === 0 ? (
            <div className="my-auto flex min-h-[18rem] flex-col justify-center rounded-2xl glass-panel p-8 text-center sm:p-10">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                <Bot className="size-6" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">
                How can Hermes assist your home lab?
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-zinc-400">
                Hermes has direct diagnostic access to the local agent tools. Query container states,
                system resources, or request infrastructure troubleshooting.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <article
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" ? (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 mt-1">
                    <Bot className="size-4" />
                  </div>
                ) : null}

                <div
                  className={cn(
                    "min-w-0 max-w-2xl rounded-2xl p-4 sm:p-5 shadow-sm text-sm leading-relaxed",
                    message.role === "user"
                      ? "border border-cyan-500/20 bg-cyan-500/10 text-white"
                      : "glass-card-static border-white/[0.08] text-zinc-200"
                  )}
                >
                  <p className="mb-1.5 font-mono text-[10px] font-medium tracking-wider text-zinc-400 uppercase">
                    {message.role === "assistant" ? "Hermes Agent" : "Harvy"}
                  </p>
                  {message.content ? (
                    <div className="whitespace-pre-wrap break-words">
                      {message.content}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-cyan-300">
                      <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                      Generating response...
                    </div>
                  )}
                </div>

                {message.role === "user" ? (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-zinc-300 mt-1">
                    <UserRound className="size-4" />
                  </div>
                ) : null}
              </article>
            ))
          )}

          {activity ? (
            <div className="flex items-center gap-2 pl-1 font-mono text-[11px] text-cyan-300">
              <Wrench className="size-3.5" aria-hidden="true" />
              <span>{activity}</span>
            </div>
          ) : null}

          {chatError ? (
            <div
              role="alert"
              className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200"
            >
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-300" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed">{chatError.message}</p>
                  {chatError.retry ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="tactile-button mt-3 rounded-lg border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
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
          ) : null}
          <div ref={messagesEndRef} />
        </div>
      </section>

      <div className="relative z-10 border-t border-white/[0.08] bg-[#07090e]/90 backdrop-blur-xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        <form className="mx-auto w-full max-w-5xl" onSubmit={submitMessage}>
          <label htmlFor="chat-composer" className="sr-only">
            Message Hermes
          </label>
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-black/40 p-2.5 focus-within:border-cyan-400/50 focus-within:ring-2 focus-within:ring-cyan-400/20">
            <textarea
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
                  ? "Configure the Hermes API key to enable live agent chat"
                  : "Ask Hermes about home lab status, Docker, or server diagnostics..."
              }
              className="max-h-40 min-h-12 w-full resize-none bg-transparent px-2.5 py-1 text-sm leading-relaxed text-white outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-55"
            />
            <Button
              type="submit"
              className="tactile-button focus-ring-glow min-h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 text-xs font-semibold text-white shadow-md hover:from-cyan-400 hover:to-blue-500"
              disabled={composerDisabled || !composer.trim()}
            >
              {streaming ? (
                <LoaderCircle className="animate-spin size-3.5" data-icon="inline-start" aria-hidden="true" />
              ) : (
                <Send className="size-3.5" data-icon="inline-start" aria-hidden="true" />
              )}
              {streaming ? "Thinking..." : "Send"}
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-zinc-500">
            <span>Return to send &middot; Shift+Return for newline</span>
            <span>Secured Browser Session</span>
          </div>
        </form>
      </div>
    </main>
  );
}
