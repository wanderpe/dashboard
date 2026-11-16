#!/usr/bin/env python3
"""Regression test that friend chats receive an isolated, privacy-scoped agent session."""

import http.cookiejar
import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = os.environ.get("DASHBOARD_BASE_URL", "https://homeserver.tailc6938f.ts.net").rstrip("/")


def request(opener, method, path, payload=None, form=False, extra_headers=None):
    data = None
    headers = dict(extra_headers or {})
    if payload is not None:
        if form:
            data = urllib.parse.urlencode(payload).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(payload).encode()
            headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with opener.open(req, timeout=120) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()


def assistant_text(raw):
    chunks = []
    for line in raw.decode("utf-8", "replace").splitlines():
        if not line.startswith("data: ") or line == "data: [DONE]":
            continue
        try:
            payload = json.loads(line[6:])
        except json.JSONDecodeError:
            continue
        delta = payload.get("choices", [{}])[0].get("delta", {}).get("content")
        if isinstance(delta, str):
            chunks.append(delta)
    return "".join(chunks)


def main():
    suffix = secrets.token_hex(8)
    account = {
        "name": "Privacy Test Friend",
        "username": f"privacy-{suffix}",
        "email": f"privacy-{suffix}@example.invalid",
        "password": secrets.token_urlsafe(24),
    }
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
    )
    status, _, body = request(opener, "POST", "/api/auth/register", account)
    assert status == 201, (status, body[:200])

    status, _, body = request(opener, "GET", "/api/account-auth/providers")
    providers = json.loads(body)
    assert status == 200 and "credentials" in providers, (status, body[:200])
    status, _, body = request(opener, "GET", "/api/account-auth/csrf")
    csrf_token = json.loads(body)["csrfToken"]
    status, _, body = request(
        opener,
        "POST",
        "/api/account-auth/callback/credentials",
        {
            "csrfToken": csrf_token,
            "email": account["email"],
            "password": account["password"],
            "callbackUrl": BASE + "/chat",
        },
        form=True,
        extra_headers={"X-Auth-Return-Redirect": "1"},
    )
    callback = json.loads(body)
    assert status == 200 and "error=" not in callback.get("url", ""), (status, body[:200])

    status, _, body = request(opener, "GET", "/api/auth/session")
    assert status == 200 and json.loads(body).get("authenticated") is True, (status, body[:200])

    client_session_id = f"dashboard-{uuid.uuid4()}"
    request_id = f"turn-{uuid.uuid4()}"
    status, headers, body = request(
        opener,
        "POST",
        "/api/chat",
        {
            "messages": [{
                "role": "user",
                "content": "Who am I? Answer with my exact profile display name, then say you only know that profile value. Do not use tools.",
            }],
            "sessionId": client_session_id,
            "requestId": request_id,
        },
    )
    assert status == 200, (status, body[:200])
    scoped_session_id = next(
        (value for key, value in headers.items() if key.lower() == "x-hermes-session-id"),
        "",
    )
    assert scoped_session_id.startswith("dashboard-")
    assert scoped_session_id != client_session_id

    text = assistant_text(body).lower()
    profile_memory = "privacy test friend" in text
    assert profile_memory, "The friend response did not use the authenticated profile display name."
    print(json.dumps({"ok": True, "scoped_session": True, "profile_memory": True}))


if __name__ == "__main__":
    main()
