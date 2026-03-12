"""
Connectivity manager for resilient Tor-routed dark web scanning.

This module provides a full scan workflow that:
- routes every request through Tor SOCKS5 (127.0.0.1:9050)
- retries failed requests with exponential backoff
- rotates Tor circuits on failure
- falls back to alternative onion mirrors when needed
- continuously scans until all sources are processed
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from stem import Signal
from stem.control import Controller


# Configure module logging once so scan progress and errors are visible.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
LOGGER = logging.getLogger(__name__)


class TorConnectionManager:
    """Manage Tor session routing, connectivity checks, and identity rotation."""

    def __init__(
        self,
        socks_host: str = "127.0.0.1",
        socks_port: int = 9050,
        control_host: str = "127.0.0.1",
        control_port: int = 9051,
        control_password: Optional[str] = None,
        request_timeout: int = 30,
    ) -> None:
        self.socks_host = socks_host
        self.socks_port = socks_port
        self.control_host = control_host
        self.control_port = control_port
        self.control_password = control_password
        self.request_timeout = request_timeout
        self.session = self._build_tor_session()

    def _build_tor_session(self) -> requests.Session:
        """Create a persistent requests session that is always pinned to Tor."""
        proxy_url = f"socks5h://{self.socks_host}:{self.socks_port}"
        session = requests.Session()
        session.trust_env = False
        session.proxies = {
            "http": proxy_url,
            "https": proxy_url,
        }
        session.headers.update(
            {
                "User-Agent": "DarkWebConnectivityManager/1.0",
                "Accept": "text/html,application/xhtml+xml",
            }
        )
        return session

    def _tor_controller(self) -> Controller:
        """Open and authenticate a Tor controller connection."""
        controller = Controller.from_port(address=self.control_host, port=self.control_port)
        if self.control_password:
            controller.authenticate(password=self.control_password)
        else:
            controller.authenticate()
        return controller


def _is_onion_url(url: str) -> bool:
    """Allow only .onion URLs so traffic never targets clearnet destinations."""
    parsed = urlparse(url.strip())
    if parsed.scheme.lower() not in {"http", "https"}:
        return False
    if not parsed.hostname:
        return False
    return parsed.hostname.lower().endswith(".onion")


def verify_tor_connectivity(tor_manager: TorConnectionManager) -> bool:
    """Verify Tor routing through check.torproject.org using the Tor session."""
    try:
        response = tor_manager.session.get(
            "https://check.torproject.org/api/ip",
            timeout=tor_manager.request_timeout,
        )
        response.raise_for_status()
        payload = response.json()
        is_tor = bool(payload.get("IsTor"))
        if is_tor:
            LOGGER.info("Tor connectivity verified. Exit IP: %s", payload.get("IP"))
            return True
        LOGGER.error("Tor check responded, but traffic is not identified as Tor.")
        return False
    except Exception as exc:
        LOGGER.error("Tor connectivity verification failed: %s", exc)
        return False


def renew_tor_identity(tor_manager: TorConnectionManager, cooldown_seconds: int = 5) -> bool:
    """Rotate Tor circuit using NEWNYM to recover from blocked/failed routes."""
    try:
        with tor_manager._tor_controller() as controller:
            controller.signal(Signal.NEWNYM)
        time.sleep(max(0, cooldown_seconds))
        LOGGER.info("Tor identity rotated successfully.")
        return True
    except Exception as exc:
        LOGGER.error("Failed to rotate Tor identity: %s", exc)
        return False


def fetch_onion_page(url: str, tor_manager: TorConnectionManager) -> Dict[str, Any]:
    """Fetch and parse an onion page through Tor only."""
    if not _is_onion_url(url):
        return {
            "source": url,
            "reachable": False,
            "error": "non_onion_url_rejected",
            "text": "",
            "title": "",
        }

    try:
        response = tor_manager.session.get(url, timeout=tor_manager.request_timeout)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        page_title = soup.title.get_text(strip=True) if soup.title else ""
        page_text = soup.get_text(separator=" ", strip=True)

        return {
            "source": url,
            "reachable": True,
            "error": None,
            "status_code": response.status_code,
            "title": page_title,
            "text": page_text,
        }
    except requests.RequestException as exc:
        return {
            "source": url,
            "reachable": False,
            "error": str(exc),
            "text": "",
            "title": "",
        }


def retry_request_with_backoff(
    url: str,
    tor_manager: TorConnectionManager,
    retries: int = 3,
    initial_delay_seconds: float = 1.0,
    backoff_factor: float = 2.0,
) -> Dict[str, Any]:
    """Retry a failed onion request with exponential backoff and Tor circuit rotation."""
    last_result: Dict[str, Any] = {
        "source": url,
        "reachable": False,
        "error": "no_attempts_made",
        "text": "",
        "title": "",
    }

    attempts = max(1, retries)
    for attempt in range(1, attempts + 1):
        LOGGER.info("Fetching %s (attempt %d/%d)", url, attempt, attempts)
        result = fetch_onion_page(url, tor_manager)
        if result.get("reachable"):
            return result

        last_result = result
        LOGGER.warning("Attempt %d failed for %s: %s", attempt, url, result.get("error"))

        renew_tor_identity(tor_manager)

        if attempt < attempts:
            sleep_seconds = initial_delay_seconds * (backoff_factor ** (attempt - 1))
            time.sleep(sleep_seconds)

    return last_result


def keyword_matching_logic(text: str, keywords: List[str]) -> List[str]:
    """Return matched keyword strings and extracted emails as indicators."""
    matches: List[str] = []
    lowered = text.lower() if text else ""

    for keyword in keywords:
        token = (keyword or "").strip()
        if not token:
            continue
        if token.lower() in lowered:
            matches.append(token)

    # Include potential leaked emails as structured breach indicators.
    email_pattern = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}")
    found_emails = email_pattern.findall(text or "")
    matches.extend(found_emails)

    # Keep order while deduplicating.
    unique_matches = list(dict.fromkeys(matches))
    return unique_matches


def _normalize_source_entry(entry: Any) -> Dict[str, Any]:
    """Normalize source formats into a single structure with alternatives."""
    if isinstance(entry, str):
        return {"source": entry, "alternatives": []}

    if isinstance(entry, dict):
        source = str(entry.get("source") or "").strip()
        alternatives = entry.get("alternatives") or []
        if not isinstance(alternatives, list):
            alternatives = []
        alternatives = [str(item).strip() for item in alternatives if str(item).strip()]
        return {"source": source, "alternatives": alternatives}

    return {"source": "", "alternatives": []}


def scan_multiple_darkweb_sources(
    sources: List[Any],
    keywords: List[str],
    tor_manager: TorConnectionManager,
    retries_per_source: int = 3,
) -> List[Dict[str, Any]]:
    """
    Scan each source with retries and fallback mirrors.

    Output format example:
    {
      "source": "example.onion",
      "status": "breach",
      "matches": ["email@example.com"]
    }
    """
    results: List[Dict[str, Any]] = []

    for raw_entry in sources:
        entry = _normalize_source_entry(raw_entry)
        primary_source = entry.get("source", "")
        alternatives = entry.get("alternatives", [])

        if not primary_source:
            LOGGER.error("Skipping invalid source entry: %s", raw_entry)
            continue

        LOGGER.info("Starting scan for source: %s", primary_source)
        candidate_sources = [primary_source] + [alt for alt in alternatives if alt != primary_source]

        chosen_result: Optional[Dict[str, Any]] = None
        chosen_source: Optional[str] = None

        for candidate in candidate_sources:
            fetch_result = retry_request_with_backoff(
                url=candidate,
                tor_manager=tor_manager,
                retries=retries_per_source,
            )
            if fetch_result.get("reachable"):
                chosen_result = fetch_result
                chosen_source = candidate
                if candidate != primary_source:
                    LOGGER.info("Switched to alternative source %s for %s", candidate, primary_source)
                break

            LOGGER.warning("Source candidate unreachable: %s", candidate)

        if not chosen_result:
            results.append(
                {
                    "source": primary_source,
                    "status": "unreachable",
                    "matches": [],
                }
            )
            continue

        match_items = keyword_matching_logic(chosen_result.get("text", ""), keywords)
        status = "breach" if match_items else "clean"

        results.append(
            {
                "source": primary_source,
                "status": status,
                "matches": match_items,
                "resolved_source": chosen_source,
            }
        )

    return results


def continuous_scanning_controller_loop(
    sources: List[Any],
    keywords: List[str],
    tor_manager: TorConnectionManager,
    retries_per_source: int = 3,
) -> List[Dict[str, Any]]:
    """
    Continuously process the source list until all entries are scanned.

    This loop is resilient: one source failure never stops the global scan.
    """
    pending_queue = list(sources)
    final_results: List[Dict[str, Any]] = []

    LOGGER.info("Continuous scanning loop started. Total sources: %d", len(pending_queue))

    while pending_queue:
        current = pending_queue.pop(0)
        try:
            batch_results = scan_multiple_darkweb_sources(
                sources=[current],
                keywords=keywords,
                tor_manager=tor_manager,
                retries_per_source=retries_per_source,
            )
            final_results.extend(batch_results)
        except Exception as exc:
            normalized = _normalize_source_entry(current)
            source_name = normalized.get("source") or str(current)
            LOGGER.error("Unexpected error while scanning %s: %s", source_name, exc)
            final_results.append(
                {
                    "source": source_name,
                    "status": "error",
                    "matches": [],
                }
            )

    LOGGER.info("Continuous scanning loop completed. Processed sources: %d", len(final_results))
    return final_results


if __name__ == "__main__":
    # Example invocation for local validation.
    SOURCE_LIST = [
        {
            "source": "http://exampleprimarysource.onion",
            "alternatives": [
                "http://examplebackupsource1.onion",
                "http://examplebackupsource2.onion",
            ],
        }
    ]
    KEYWORDS = ["breach", "leak", "password", "email"]

    manager = TorConnectionManager()
    if not verify_tor_connectivity(manager):
        LOGGER.error("Tor is not reachable. Aborting scan run.")
    else:
        output = continuous_scanning_controller_loop(
            sources=SOURCE_LIST,
            keywords=KEYWORDS,
            tor_manager=manager,
            retries_per_source=3,
        )
        print(json.dumps(output, indent=2))