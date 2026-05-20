"""CORS helpers for responses that bypass the normal middleware chain."""
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings


def cors_headers_for_request(request: Request) -> dict[str, str]:
    origin = request.headers.get("origin")
    if origin and origin in settings.get_cors_origins():
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }
    return {}


def apply_cors_headers(request: Request, response: Response) -> Response:
    for key, value in cors_headers_for_request(request).items():
        response.headers[key] = value
    return response
