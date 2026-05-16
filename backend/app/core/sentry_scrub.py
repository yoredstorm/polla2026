"""Redact sensitive fields before sending events to Sentry."""


def scrub_sentry_event(event, hint):
    request = event.get("request") or {}
    headers = request.get("headers") or {}
    if isinstance(headers, dict):
        for key in list(headers.keys()):
            lk = key.lower()
            if lk in ("cookie", "authorization", "x-api-key"):
                headers[key] = "[Filtered]"
        request["headers"] = headers
    if "cookies" in request:
        request["cookies"] = "[Filtered]"

    for entry in event.get("breadcrumbs", {}).get("values") or []:
        msg = entry.get("message") or ""
        if any(s in msg.lower() for s in ("password", "token", "secret", "authorization")):
            entry["message"] = "[Filtered]"

    return event
