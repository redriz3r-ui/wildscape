import time
from typing import Protocol
import httpx


class SourceAdapter(Protocol):
    def records(self, config: dict): ...


def request(url, params=None, headers=None):
    for attempt in range(3):
        try:
            response = httpx.get(url, params=params, headers=headers, timeout=45, follow_redirects=True)
            if response.status_code in (429, 500, 502, 503, 504) and attempt < 2:
                delay = min(10, float(response.headers.get("Retry-After", 2**attempt)))
                time.sleep(delay)
                continue
            response.raise_for_status()
            return response
        except (httpx.TimeoutException, httpx.ConnectError):
            if attempt == 2:
                raise ValueError(f"Remote source unavailable: {url}") from None
            time.sleep(2**attempt)
    raise ValueError(f"Remote source unavailable or rate limited: {url}")
