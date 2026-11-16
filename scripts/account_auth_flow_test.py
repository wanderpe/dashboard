#!/usr/bin/env python3
"""Integration test for Auth.js account registration, JWT sessions, and logout."""

import http.cookiejar
import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("DASHBOARD_BASE_URL", "https://homeserver.tailc6938f.ts.net").rstrip("/")


def request(opener, method, path, payload=None, form=False, headers=None):
    body = None
    request_headers = dict(headers or {})
    if payload is not None:
        if form:
            body = urllib.parse.urlencode(payload).encode()
            request_headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = json.dumps(payload).encode()
            request_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=body, headers=request_headers, method=method)
    try:
        with opener.open(req, timeout=20) as response:
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = raw
        return exc.code, parsed


def as_object(value):
    if not isinstance(value, dict):
        raise AssertionError(value)
    return value


def get_page(opener, path):
    with opener.open(BASE + path, timeout=20) as response:
        return response.status, response.read().decode()


def main():
    suffix = secrets.token_hex(8)
    account = {
        "username": f"friend-{suffix}",
        "email": f"friend-{suffix}@example.invalid",
        "password": secrets.token_urlsafe(24),
        "name": "Private Friend",
    }
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))

    status, body = request(opener, "POST", "/api/auth/register", account)
    assert status == 201, (status, body)
    assert as_object(body).get("accountCreated") is True
    assert not any("session-token" in cookie.name for cookie in cookie_jar)

    status, providers = request(opener, "GET", "/api/account-auth/providers")
    assert status == 200 and "credentials" in as_object(providers), (status, providers)

    status, csrf_body = request(opener, "GET", "/api/account-auth/csrf")
    csrf_token = as_object(csrf_body).get("csrfToken")
    assert status == 200 and isinstance(csrf_token, str) and csrf_token, (status, csrf_body)

    status, callback = request(
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
        headers={"X-Auth-Return-Redirect": "1"},
    )
    callback_url = as_object(callback).get("url", "")
    assert status == 200 and "error=" not in callback_url, (status, callback)
    assert any("session-token" in cookie.name and cookie.value for cookie in cookie_jar)

    status, authjs_session = request(opener, "GET", "/api/account-auth/session")
    user = as_object(authjs_session).get("user")
    assert status == 200 and isinstance(user, dict) and user.get("name") == account["name"], (status, authjs_session)

    status, session_body = request(opener, "GET", "/api/auth/session")
    session = as_object(session_body)
    assert status == 200 and session.get("authenticated") is True, (status, session_body)
    assert session.get("profile", {}).get("displayName") == account["name"], (status, session_body)

    page_status, page = get_page(opener, "/")
    assert page_status == 200 and f"Welcome back, {account['name']}" in page, (page_status, page[:500])

    status, logout_body = request(opener, "POST", "/api/auth/logout")
    assert status == 200 and as_object(logout_body).get("authenticated") is False, (status, logout_body)

    status, csrf_body = request(opener, "GET", "/api/account-auth/csrf")
    csrf_token = as_object(csrf_body).get("csrfToken")
    status, _ = request(
        opener,
        "POST",
        "/api/account-auth/signout",
        {"csrfToken": csrf_token, "callbackUrl": BASE + "/chat"},
        form=True,
        headers={"X-Auth-Return-Redirect": "1"},
    )
    assert status == 200

    status, session_body = request(opener, "GET", "/api/auth/session")
    assert status == 200 and as_object(session_body).get("authenticated") is False, (status, session_body)
    print(json.dumps({"ok": True, "authjs_credentials": True, "personalized_session": True, "logout": True}))


if __name__ == "__main__":
    main()
