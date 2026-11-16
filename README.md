# Eric AI

Private Next.js dashboard for Eric AI conversations and account-based access. Auth.js (Credentials provider with encrypted JWT sessions) handles browser authentication; the sessions API validates each account session before chat access.

## Requirements

- Node.js compatible with the installed Next.js version
- npm
- Access to the private host or tunnel where the dashboard and sessions API run
- Hermes Agent configured with a working model/provider before live chat is enabled

## Dashboard setup

Install dependencies:

```bash
cd /home/hermes/dashboard
npm install
```

Create `/home/hermes/dashboard/.env.local` with the server-only credentials below. Generate a unique Auth.js secret with `openssl rand -base64 32` and store it as `AUTH_SECRET`:

```dotenv
AUTH_SECRET=<generated-private-authjs-secret>
SESSION_API_URL=http://127.0.0.1:3001
HERMES_API_KEY=<same-value-as-API_SERVER_KEY-in-Hermes>
```

The UI uses [Auth.js Credentials authentication](https://authjs.dev/getting-started/authentication) and encrypted JWT session cookies. The sessions API remains the source of truth for account validity and chat authorization. Keep all values private; `.env.local` is ignored by Git.

## Friend account access

Friends open the public dashboard and choose `Create account`, then enter a display name, username, email, and password. Account creation is followed by Auth.js Credentials sign-in; the resulting encrypted, HttpOnly JWT session carries the sessions-API token server-side, and every chat request verifies that token with the sessions API. Later visits use `Sign in`. The displayed workspace name and chat speaker label are derived from the current Auth.js session, not a fixed owner name.

Start the dashboard on loopback:

```bash
cd /home/hermes/dashboard
npm run dev -- --hostname 127.0.0.1
```

Open `http://localhost:3000/chat` through an SSH tunnel or from the host itself.

## Enable the Hermes API

The installed Hermes API supports OpenAI-compatible chat completions, SSE streaming, bearer authentication, and explicit session continuity through `X-Hermes-Session-Id`.

Add these values to `/home/hermes/.hermes/.env`:

```dotenv
API_SERVER_ENABLED=true
API_SERVER_KEY=<generate-and-paste-a-separate-private-key>
```

Use the exact same `API_SERVER_KEY` value as `HERMES_API_KEY` in the dashboard's `.env.local`.

If the gateway runs as a managed service, reload it after changing the environment:

```bash
hermes gateway restart
```

If it runs manually, stop the current foreground gateway process and start it again:

```bash
hermes gateway
```

The API should then listen only on `http://127.0.0.1:8642` by default. The dashboard server proxies requests to the fixed endpoint `http://127.0.0.1:8642/v1/chat/completions`, so browser CORS access is not required.

Verify the local API without exposing the key in browser code:

```bash
curl http://127.0.0.1:8642/v1/chat/completions \
  -H "Authorization: Bearer $API_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"hermes-agent","messages":[{"role":"user","content":"Reply with: Hermes API ready"}]}'
```

## Connect the Messenger bot to your Facebook Page (single-Page setup)

The webhook endpoint is `/api/messenger/webhook` on this dashboard. It accepts only signed Page webhooks for the configured Page, ignores echoes and non-text events, uses an isolated Hermes session per sender, and replies as the Page within Messenger's response window. It sends an acknowledgement before generating the reply so Meta receives a quick webhook response.

Before enabling it:

1. Create a Meta developer app with the Messenger use case and link your Facebook Page. Configure Page message webhooks and subscribe the Page to the `messages` field. Meta's current Messenger docs list `pages_show_list`, `pages_manage_metadata`, and `pages_messaging` as the common required permissions. Use Meta's current App Review requirements if non-role users will message the Page.
2. Set the callback URL to `https://<your-public-domain>/api/messenger/webhook` and use a newly generated random verify token in Meta and `MESSENGER_VERIFY_TOKEN` below.
3. Store `MESSENGER_APP_SECRET`, `MESSENGER_PAGE_ACCESS_TOKEN`, `MESSENGER_PAGE_ID`, and `MESSENGER_VERIFY_TOKEN` in `/home/hermes/dashboard/.env.local`. Never put these values in chat, source code, or the browser.
4. Use a dedicated Hermes API server/profile for Messenger with an empty `api_server` toolset. Do not point public Messenger input at the general Hermes API server: its configured tools may access the host. Set `MESSENGER_HERMES_API_URL` to the dedicated server URL and `MESSENGER_HERMES_API_KEY` to that server's key. The integration fails closed if these settings or the Meta credentials are missing.
5. Restart the dedicated Hermes API and dashboard, then complete Meta's webhook verification. Send a test message from a non-admin Facebook account and verify the Page replies.

The route defaults to Graph API `v27.0` (current as of November 2026); set `MESSENGER_GRAPH_API_VERSION` if Meta's supported version changes. Replies use the standard 24-hour response type. This first version handles text messages only; it does not read personal Messenger accounts or images/attachments. Meta requires automated bots to respond promptly and may require AI disclosure depending on jurisdiction; the bot prompt identifies it as an automated assistant.

## Mock streaming mode

Use mock mode to verify authentication, the message UI, and incremental SSE rendering without enabling the Hermes API.

Add this temporary line to `/home/hermes/dashboard/.env.local`:

```dotenv
HERMES_CHAT_MOCK=true
```

Restart the dashboard, sign in at `/chat`, and send a message. Remove the line when verification is complete.

## Browser-session conversation behavior

- One conversation ID is stored in `sessionStorage` for the current browser tab/session.
- Message history is stored in `sessionStorage`, not in a database.
- “New conversation” creates a new Hermes session ID and clears the browser-session history.
- The server sends only the current user turn upstream; Hermes loads prior turns using the authenticated, profile-scoped `X-Hermes-Session-Id` header.
- Every friend request includes a privacy system boundary that prevents disclosure of the host owner's identity, host details, or other users' chats.
- Each turn includes an `Idempotency-Key` so an exact retry does not execute the same admitted work twice when Hermes can replay it.

## Private preview from a Windows laptop

Start the dashboard on the Debian host as shown above, then create an SSH tunnel from Windows PowerShell:

```powershell
ssh -L 3000:127.0.0.1:3000 hermes@<debian-host>
```

Keep the SSH session open and browse to:

```text
http://localhost:3000
```

## Checks

```bash
npm run lint
npm run build
```
