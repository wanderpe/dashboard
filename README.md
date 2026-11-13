# Harvy's Home Lab Dashboard

Private Next.js dashboard for Cockpit, Portainer, Windows storage, Debian host telemetry, and an owner-only Hermes chat page.

## Requirements

- Node.js compatible with the installed Next.js version
- npm
- Tailscale access to the home lab
- Hermes Agent configured with a working model/provider before live chat is enabled

## Dashboard setup

Install dependencies:

```bash
cd /home/hermes/dashboard
npm install
```

Generate a private dashboard owner token (at least 24 characters):

```bash
openssl rand -hex 32
```

Create `/home/hermes/dashboard/.env.local`:

```dotenv
DASHBOARD_OWNER_TOKEN=<paste-the-generated-owner-token>
HERMES_API_KEY=<same-value-as-API_SERVER_KEY-in-Hermes>
```

Keep both values private. `.env.local` is ignored by Git. The owner token is exchanged for an HTTP-only, SameSite=Strict browser-session cookie; it is not stored in the chat page.

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
- The server sends only the current user turn upstream; Hermes loads prior turns using the authenticated `X-Hermes-Session-Id` header.
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
