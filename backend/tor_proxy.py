"""
Tor-enabled dark web page fetcher and keyword scanner.

This module forces all HTTP(S) requests through a local Tor SOCKS5 proxy
(127.0.0.1:9050) so .onion targets are never requested over the normal network.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List
from urllib.parse import urlparse

import requests
import socks  # noqa: F401  # Imported to satisfy explicit PySocks dependency.
from bs4 import BeautifulSoup
from requests.exceptions import RequestException
from stem import SocketError
from stem.control import Controller


# Tor proxy configuration. socks5h ensures DNS resolution happens through Tor.
TOR_SOCKS_HOST = "127.0.0.1"
TOR_SOCKS_PORT = 9050
TOR_SOCKS_PROXY = f"socks5h://{TOR_SOCKS_HOST}:{TOR_SOCKS_PORT}"

# Tor control port is optional but useful for service-level checks.
TOR_CONTROL_HOST = "127.0.0.1"
TOR_CONTROL_PORT = 9051
TOR_CONTROL_PASSWORD = os.getenv("TOR_CONTROL_PASSWORD", "")

REQUEST_TIMEOUT_SECONDS = 30

# Accept v2 (16 chars) and v3 (56 chars) onion addresses, optional subdomains.
ONION_HOST_RE = re.compile(
    r"^([a-z2-7]{16}|[a-z2-7]{56})(\.[a-z2-7]{16}|\.[a-z2-7]{56})*\.onion$",
    re.IGNORECASE,
)


class TorProxyError(RuntimeError):
    """Raised when Tor connectivity or proxy constraints fail."""


class InvalidOnionUrlError(ValueError):
    """Raised when a target is not a valid .onion URL."""


def _build_tor_session() -> requests.Session:
    """Create a requests session pinned to Tor-only SOCKS5 proxy routing."""
    session = requests.Session()
    session.trust_env = False  # Ignore OS proxy variables to prevent leaks.
    session.proxies = {
        "http": TOR_SOCKS_PROXY,
        "https": TOR_SOCKS_PROXY,
    }
    session.headers.update(
        {
            "User-Agent": "DarkWatchTorScanner/1.0",
            "Accept": "text/html,application/xhtml+xml",
        }
    )
    return session


def _validate_onion_url(url: str) -> str:
    """Validate scheme + host to ensure only onion destinations are scanned."""
    try:
        parsed = urlparse(url.strip())
    except Exception as exc:
        raise InvalidOnionUrlError(f"Invalid URL format: {url}") from exc

    if parsed.scheme.lower() not in {"http", "https"}:
        raise InvalidOnionUrlError("Onion URL must use http or https scheme.")

    if not parsed.hostname:
        raise InvalidOnionUrlError("Onion URL is missing a hostname.")

    host = parsed.hostname.lower()
    if not ONION_HOST_RE.match(host):
        raise InvalidOnionUrlError(f"Invalid onion hostname: {host}")

    return url


def test_tor_connection(timeout: int = 10) -> Dict[str, Any]:
    """
    Verify Tor service availability.

    1) Try connecting to Tor control port via stem.
    2) Validate SOCKS proxy routing with a request over the Tor proxy.
    """
    controller_ok = False
    controller_error = None

    try:
        with Controller.from_port(address=TOR_CONTROL_HOST, port=TOR_CONTROL_PORT) as controller:
            if TOR_CONTROL_PASSWORD:
                controller.authenticate(password=TOR_CONTROL_PASSWORD)
            else:
                controller.authenticate()
            controller_ok = True
    except Exception as exc:  # Control port might be disabled; keep diagnostic only.
        controller_error = str(exc)

    session = _build_tor_session()

    try:
        # This endpoint confirms Tor usage and returns JSON.
        response = session.get(
            "https://check.torproject.org/api/ip",
            timeout=timeout,
            allow_redirects=True,
        )
        response.raise_for_status()
        payload = response.json()
        is_tor = bool(payload.get("IsTor"))
        ip = payload.get("IP")

        if not is_tor:
            raise TorProxyError(
                "Proxy reached the internet but response indicates traffic is not using Tor."
            )

        return {
            "ok": True,
            "tor_running": True,
            "tor_ip": ip,
            "controller_ok": controller_ok,
            "controller_error": controller_error,
        }

    except (RequestException, SocketError, OSError) as exc:
        raise TorProxyError(
            "Unable to connect through Tor SOCKS5 proxy at 127.0.0.1:9050. "
            "Ensure Tor is running."
        ) from exc


def fetch_onion_page(url: str) -> Dict[str, Any]:
    """
    Fetch one .onion page over Tor and return structured metadata + text.

    Returns a dict with success/error state, status code, title, and cleaned text.
    """
    result: Dict[str, Any] = {
        "url": url,
        "success": False,
        "status_code": None,
        "title": None,
        "content": "",
        "error": None,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        _validate_onion_url(url)
        test_tor_connection(timeout=10)

        session = _build_tor_session()
        response = session.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
        result["status_code"] = response.status_code
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        title = soup.title.get_text(strip=True) if soup.title else ""

        # Extract readable text for keyword scanning.
        text_content = soup.get_text(separator=" ", strip=True)
        text_content = re.sub(r"\s+", " ", text_content).strip()

        result["title"] = title
        result["content"] = text_content
        result["success"] = True

    except InvalidOnionUrlError as exc:
        result["error"] = f"invalid_onion_url: {exc}"
    except TorProxyError as exc:
        result["error"] = f"tor_connection_error: {exc}"
    except RequestException as exc:
        result["error"] = f"connection_error: {exc}"
    except Exception as exc:
        result["error"] = f"unexpected_error: {exc}"

    return result


def search_keywords(content: str, keywords: List[str]) -> Dict[str, Any]:
    """Search content and return keyword-level match counts + snippets."""
    normalized_content = content or ""
    lowered_content = normalized_content.lower()

    matches: List[Dict[str, Any]] = []

    for keyword in keywords:
        if not keyword:
            continue

        pattern = re.compile(re.escape(keyword), re.IGNORECASE)
        occurrences = list(pattern.finditer(normalized_content))
        if not occurrences:
            continue

        snippets: List[str] = []
        for match in occurrences[:3]:  # Limit snippet count to keep payload manageable.
            start = max(0, match.start() - 60)
            end = min(len(normalized_content), match.end() + 60)
            snippets.append(normalized_content[start:end])

        matches.append(
            {
                "keyword": keyword,
                "count": len(occurrences),
                "snippets": snippets,
            }
        )

    return {
        "matched": len(matches) > 0,
        "total_keywords": len([k for k in keywords if k]),
        "matched_keywords": len(matches),
        "results": matches,
        "content_length": len(lowered_content),
    }


def scan_darkweb_sources(keywords: List[str], sources: List[str]) -> Dict[str, Any]:
    """Scan multiple onion sources and return a complete JSON-serializable report."""
    scan_started_at = datetime.now(timezone.utc).isoformat()
    source_reports: List[Dict[str, Any]] = []

    for source in sources:
        page_data = fetch_onion_page(source)

        report: Dict[str, Any] = {
            "url": source,
            "fetched": page_data.get("success", False),
            "status_code": page_data.get("status_code"),
            "title": page_data.get("title"),
            "error": page_data.get("error"),
            "keyword_scan": {
                "matched": False,
                "total_keywords": len(keywords),
                "matched_keywords": 0,
                "results": [],
                "content_length": 0,
            },
        }

        if page_data.get("success"):
            report["keyword_scan"] = search_keywords(page_data.get("content", ""), keywords)

        source_reports.append(report)

    total_sources = len(sources)
    fetched_sources = sum(1 for item in source_reports if item["fetched"])
    matched_sources = sum(1 for item in source_reports if item["keyword_scan"]["matched"])

    return {
        "scan_started_at": scan_started_at,
        "scan_completed_at": datetime.now(timezone.utc).isoformat(),
        "tor_proxy": TOR_SOCKS_PROXY,
        "keywords": keywords,
        "summary": {
            "total_sources": total_sources,
            "fetched_sources": fetched_sources,
            "matched_sources": matched_sources,
        },
        "results": source_reports,
    }


# Example dark web source list (replace with your verified target sources).
EXAMPLE_DARKWEB_SOURCES = [
    "http://abcdefghijklmnop.onion",
    "http://abcdefghabcdefghabcdefghabcdefghabcdefghabcdefghabcdefgh.onion",
]


if __name__ == "__main__":
    example_keywords = ["database", "credentials", "leak", "wallet"]

    try:
        tor_status = test_tor_connection()
        print("Tor status:")
        print(json.dumps(tor_status, indent=2))

        scan_report = scan_darkweb_sources(example_keywords, EXAMPLE_DARKWEB_SOURCES)
        print("\nDark web scan report:")
        print(json.dumps(scan_report, indent=2))

    except TorProxyError as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc),
                    "hint": "Start Tor Browser or tor service and ensure SOCKS5 is available at 127.0.0.1:9050.",
                },
                indent=2,
            )
        )
