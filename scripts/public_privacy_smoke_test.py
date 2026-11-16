#!/usr/bin/env python3
"""Smoke test public dashboard privacy and the chat authentication boundary."""

import os
import urllib.error
import urllib.request

BASE = os.environ.get("DASHBOARD_BASE_URL", "https://homeserver.tailc6938f.ts.net").rstrip("/")
FORBIDDEN_MARKERS = (
    "100.115.141.25",
    "127.0.0.1",
    "tailscale",
    "debian",
    "cockpit",
    "portainer",
    "samba",
    "/srv/storage",
    "system telemetry",
    "endpoint reachability",
    "cpu load average",
    "root storage",
)


def get(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=20) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")


def post(path, data):
    request = urllib.request.Request(
        BASE + path,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")


def main():
    status, page = get("/")
    assert status == 200, f"homepage returned HTTP {status}"
    lowered = page.lower()
    assert not any(marker in lowered for marker in FORBIDDEN_MARKERS), "homepage contains private infrastructure details"
    assert "What are you working on?" in page, "overview action panel is missing"
    for prompt_label in ("Explain a concept", "Interpret an error", "Plan a project", "No host tools"):
        assert prompt_label in page, f"overview is missing {prompt_label!r}"
    assert page.count("/chat?q=") >= 3, "quick-start prompts should link to prefilled chat"

    status, chat_page = get("/chat")
    assert status == 200, f"chat page returned HTTP {status}"
    assert "Chat is temporarily unavailable" not in chat_page, "chat page still shows the disabled state"

    status, body = post("/api/chat", b"{}")
    assert status == 401, f"unauthenticated chat API must be rejected (got HTTP {status})"
    assert '"owner_auth_required"' in body, "chat API returned an unexpected auth response"

    status, _ = get("/api/telemetry")
    assert status == 404, f"telemetry API must be removed from public access (got HTTP {status})"
    print("Public privacy smoke test passed.")


if __name__ == "__main__":
    main()
