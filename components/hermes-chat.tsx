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
        className="hud-shell flex min-h-[calc(100svh-61px)] items-center justify-center px-4 lg:min-h-svh"
      >
        <div className="flex items-center gap-3 font-mono text-xs tracking-[0.18em] text-cyan-100/55 uppercase">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Opening private channel
        </div>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main
        id="main-content"
        className="hud-shell flex min-h-[calc(100svh-61px)] items-center justify-center px-4 lg:min-h-svh"
      >
        <div className="w-full max-w-lg border border-rose-300/25 bg-[#071522]/95 p-6 text-rose-50">
          <CircleAlert className="size-5 text-rose-200" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-medium">Owner access check failed</h1>
          <p className="mt-2 text-sm leading-6 text-rose-100/70">{sessionError}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-5 min-h-11 rounded-sm border-rose-200/30 bg-rose-200/10 text-rose-50 hover:bg-rose-200/15"
            onClick={() => window.location.reload()}
          >
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            Retry
          </Button>
        </div>
      </main>
    );
  }

  if (!session.configured) {
    return (
      <main
        id="main-content"
        className="hud-shell flex min-h-[calc(100svh-61px)] items-center justify-center px-4 py-8 lg:min-h-svh"
      >
        <section className="hud-panel w-full max-w-xl border border-amber-300/25 bg-[#071522]/95 p-6 sm:p-8">
          <div className="flex size-11 items-center justify-center border border-amber-200/25 bg-amber-200/10 text-amber-100">
            <KeyRound className="size-5" aria-hidden="true" />
          </div>
          <p className="mt-6 font-mono text-[10px] tracking-[0.2em] text-amber-100/55 uppercase">
            Owner gate // Configuration required
          </p>
          <h1 className="mt-2 text-2xl font-medium tracking-tight text-[#f2fdff]">
            Owner access is not configured
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-300/75">
            Set a private <code className="font-mono text-cyan-100">DASHBOARD_OWNER_TOKEN</code>{" "}
            in the dashboard server environment, then restart the dashboard. The setup steps are
            documented in the project README.
          </p>
        </section>
      </main>
    );
  }

  if (!session.authenticated) {
    return (
      <main
        id="main-content"
        className="hud-shell flex min-h-[calc(100svh-61px)] items-center justify-center px-4 py-8 lg:min-h-svh"
      >
        <section className="hud-panel w-full max-w-md border border-cyan-200/20 bg-[#071522]/95 p-6 sm:p-8">
          <div className="flex size-11 items-center justify-center border border-cyan-200/25 bg-cyan-300/[0.06] text-cyan-200">
            <LockKeyhole className="size-5" aria-hidden="true" />
          </div>
          <p className="mt-6 font-mono text-[10px] tracking-[0.22em] text-cyan-100/45 uppercase">
            Private channel // Owner only
          </p>
          <h1 className="mt-2 text-2xl font-medium tracking-tight text-[#f2fdff]">
            Unlock Hermes Chat
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-300/70">
            Enter the dashboard owner token. It is exchanged for an HTTP-only browser-session
            cookie and is not stored in the page.
          </p>

          <form className="mt-6" onSubmit={authenticate}>
            <label
              htmlFor="owner-token"
              className="font-mono text-[10px] tracking-[0.18em] text-cyan-100/50 uppercase"
            >
              Owner token
            </label>
            <input
              id="owner-token"
              type="password"
              value={ownerToken}
              onChange={(event) => setOwnerToken(event.target.value)}
              autoComplete="current-password"
              required
              minLength={24}
              className="mt-2 min-h-11 w-full rounded-sm border border-cyan-200/20 bg-[#020b14] px-3 text-sm text-cyan-50 outline-none placeholder:text-slate-500 focus-visible:border-cyan-200/70 focus-visible:ring-2 focus-visible:ring-cyan-200/40"
              placeholder="Enter private owner token"
            />
            {authError ? (
              <p role="alert" className="mt-3 text-sm leading-6 text-rose-200">
                {authError}
              </p>
            ) : null}
            <Button
              type="submit"
              className="mt-5 min-h-11 w-full rounded-sm border border-cyan-100 bg-cyan-200 text-[#03111c] hover:bg-cyan-100 focus-visible:ring-cyan-100/70"
              disabled={authenticating || ownerToken.length < 24}
            >
              {authenticating ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden="true" />
              ) : (
                <LockKeyhole data-icon="inline-start" aria-hidden="true" />
              )}
              {authenticating ? "Unlocking…" : "Unlock chat"}
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
      className="hud-shell grid h-[calc(100svh-61px)] min-h-[36rem] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden lg:h-svh"
    >
      <header className="relative z-10 border-b border-cyan-100/10 bg-[#03101b]/88 px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-cyan-100/45 uppercase">
              <MessageSquareText className="size-3.5 text-cyan-200/70" aria-hidden="true" />
              Private agent channel
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-medium tracking-tight text-[#f2fdff] sm:text-2xl">
                Hermes Chat
              </h1>
              <Badge variant="outline" className={cn("rounded-sm", mode.className)}>
                {mode.label}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-300/55">{mode.description}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-sm border-cyan-200/20 bg-cyan-300/[0.04] text-cyan-50 hover:bg-cyan-300/[0.09]"
              onClick={startNewConversation}
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              New conversation
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 rounded-sm text-slate-300/70 hover:bg-cyan-300/[0.06] hover:text-cyan-50"
              onClick={() => void signOut()}
            >
              <LogOut data-icon="inline-start" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <section
        aria-label="Hermes conversation"
        aria-busy={streaming}
        className="relative z-10 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7 lg:px-8"
      >
        <div
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          className="mx-auto flex w-full max-w-5xl flex-col gap-5"
        >
          {messages.length === 0 ? (
            <div className="my-auto flex min-h-[18rem] flex-col justify-center border border-cyan-200/15 bg-[#061523]/82 p-6 sm:p-8">
              <div className="flex size-11 items-center justify-center border border-cyan-200/20 bg-cyan-300/[0.05] text-cyan-200">
                <Bot className="size-5" aria-hidden="true" />
              </div>
              <p className="mt-6 font-mono text-[10px] tracking-[0.2em] text-cyan-100/45 uppercase">
                Conversation ready
              </p>
              <h2 className="mt-2 text-2xl font-medium tracking-tight text-[#f2fdff]">
                What should Hermes work on?
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300/70">
                This conversation lasts for the current browser session. Hermes can use the tools
                and model configured on the local agent.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <article
                key={message.id}
                className={cn(
                  "grid gap-3 sm:grid-cols-[2.5rem_minmax(0,1fr)]",
                  message.role === "user" && "sm:pl-14",
                )}
              >
                <div
                  className={cn(
                    "flex size-10 items-center justify-center border",
                    message.role === "assistant"
                      ? "border-cyan-200/20 bg-cyan-300/[0.05] text-cyan-200"
                      : "border-slate-300/15 bg-slate-200/[0.05] text-slate-200/70",
                  )}
                  aria-hidden="true"
                >
                  {message.role === "assistant" ? (
                    <Bot className="size-4" />
                  ) : (
                    <UserRound className="size-4" />
                  )}
                </div>
                <div
                  className={cn(
                    "min-w-0 border p-4 sm:p-5",
                    message.role === "assistant"
                      ? "border-cyan-200/15 bg-[#061523]/90 text-slate-100"
                      : "border-slate-300/12 bg-[#091522]/72 text-slate-100",
                  )}
                >
                  <p className="mb-2 font-mono text-[9px] tracking-[0.18em] text-cyan-100/40 uppercase">
                    {message.role === "assistant" ? "Hermes" : "Harvy"}
                  </p>
                  {message.content ? (
                    <div className="whitespace-pre-wrap break-words text-sm leading-7 sm:text-[0.95rem]">
                      {message.content}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-cyan-100/55">
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      Waiting for reply…
                    </div>
                  )}
                </div>
              </article>
            ))
          )}

          {activity ? (
            <div className="flex items-center gap-2 pl-1 font-mono text-[10px] tracking-[0.14em] text-cyan-100/45 uppercase">
              <Wrench className="size-3.5" aria-hidden="true" />
              {activity}
            </div>
          ) : null}

          {chatError ? (
            <div
              role="alert"
              className="border border-rose-300/25 bg-rose-300/[0.07] p-4 text-rose-50"
            >
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-200" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-6">{chatError.message}</p>
                  {chatError.retry ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 min-h-9 rounded-sm border-rose-200/30 bg-rose-200/10 text-rose-50 hover:bg-rose-200/15"
                      disabled={streaming}
                      onClick={() =>
                        void sendMessage(chatError.retry!.content, {
                          appendUser: false,
                          requestId: chatError.retry!.requestId,
                        })
                      }
                    >
                      <RotateCcw data-icon="inline-start" aria-hidden="true" />
                      Retry request
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>
      </section>

      <div className="relative z-10 border-t border-cyan-100/10 bg-[#03101b]/96 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        <form className="mx-auto w-full max-w-5xl" onSubmit={submitMessage}>
          <label htmlFor="chat-composer" className="sr-only">
            Message Hermes
          </label>
          <div className="grid gap-2 border border-cyan-200/18 bg-[#020b14] p-2 focus-within:border-cyan-200/45 focus-within:ring-2 focus-within:ring-cyan-200/20 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
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
                  ? "Configure the Hermes API key to enable chat"
                  : "Message Hermes…"
              }
              className="max-h-40 min-h-14 w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 text-cyan-50 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-55"
            />
            <Button
              type="submit"
              className="min-h-11 rounded-sm border border-cyan-100 bg-cyan-200 px-4 text-[#03111c] hover:bg-cyan-100 focus-visible:ring-cyan-100/70"
              disabled={composerDisabled || !composer.trim()}
            >
              {streaming ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden="true" />
              ) : (
                <Send data-icon="inline-start" aria-hidden="true" />
              )}
              {streaming ? "Working…" : "Send"}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[9px] tracking-[0.12em] text-cyan-100/35 uppercase">
            <span>Enter to send // Shift+Enter for newline</span>
            <span>Browser-session conversation</span>
          </div>
        </form>
      </div>
    </main>
  );
}
