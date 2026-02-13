from flask import Flask, request, jsonify
import json
from datetime import datetime
import logging
import os
import threading
import time
import uuid
import requests
from urllib.parse import urlparse
from bs4 import BeautifulSoup
from flask_cors import CORS

from polite_scraper import PoliteScraper

app = Flask(__name__)
CORS(app)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

URL_STORE_PATH = os.path.join(os.path.dirname(__file__), "urls_store.json")
SCAN_SETTINGS_PATH = os.path.join(os.path.dirname(__file__), "scan_settings.json")

DEFAULT_URLS = [
    {
        "id": "1",
        "url": "https://en.wikipedia.org/wiki/Brihadisvara_Temple",
        "name": "Default Source",
        "status": "enabled",
        "addedAt": datetime.utcnow().isoformat(),
    }
]

URLS = []
HEADERS = {"User-Agent": "keyword-monitor/1.0"}
REQUEST_TIMEOUT_SECONDS = 10
POLITE_REQUESTS_PER_MINUTE = float(os.getenv("POLITE_REQUESTS_PER_MINUTE", "12.0"))
POLITE_TIMEOUT_SECONDS = int(os.getenv("POLITE_TIMEOUT_SECONDS", "10"))
POLITE_PROXIES = [p.strip() for p in os.getenv("POLITE_PROXIES", "").split(",") if p.strip()]

POLITE_SCRAPER = PoliteScraper(
    user_agent="PoliteResearchBot/0.1 (+https://yourwebsite.com/contact; your.email@example.com)",
    requests_per_minute=POLITE_REQUESTS_PER_MINUTE,
    timeout=POLITE_TIMEOUT_SECONDS,
    proxies=POLITE_PROXIES,
)

CRAWL_DEFAULT_MAX_PAGES = int(os.getenv("CRAWL_MAX_PAGES", "60"))
CRAWL_DEFAULT_TIME_LIMIT_SECONDS = float(os.getenv("CRAWL_TIME_LIMIT_SECONDS", "30"))
CRAWL_DEFAULT_INCLUDE_SUBDOMAINS = os.getenv("CRAWL_INCLUDE_SUBDOMAINS", "true").lower() in {
    "1",
    "true",
    "yes",
    "y",
}
CRAWL_DEFAULT_MIN_PRIORITY = int(os.getenv("CRAWL_MIN_PRIORITY", "1"))
CRAWL_DEFAULT_MAX_DEPTH = int(os.getenv("CRAWL_MAX_DEPTH", "3"))

SCAN_SETTINGS_DEFAULT = {
    "pages": {
        "min": 1,
        "max": 200,
        "default": CRAWL_DEFAULT_MAX_PAGES,
    },
    "depth": {
        "min": 0,
        "max": 6,
        "default": CRAWL_DEFAULT_MAX_DEPTH,
    },
    "time_limit_seconds": {
        "min": 10.0,
        "max": 300.0,
        "default": CRAWL_DEFAULT_TIME_LIMIT_SECONDS,
    },
    "min_priority_to_expand": {
        "min": 0,
        "max": 6,
        "default": CRAWL_DEFAULT_MIN_PRIORITY,
    },
    "include_subdomains": CRAWL_DEFAULT_INCLUDE_SUBDOMAINS,
    "requests_per_minute": {
        "min": 1.0,
        "max": 60.0,
        "default": POLITE_REQUESTS_PER_MINUTE,
    },
    "request_timeout_seconds": {
        "min": 3,
        "max": 45,
        "default": POLITE_TIMEOUT_SECONDS,
    },
}

SCANS = {}
SCANS_LOCK = threading.Lock()


def parse_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y"}:
        return True
    if text in {"0", "false", "no", "n"}:
        return False
    return default


def parse_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_float(value, default):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def clamp(value, min_value, max_value):
    return max(min_value, min(value, max_value))


def normalize_range(payload, defaults, parser):
    if not isinstance(payload, dict):
        return defaults.copy()

    min_value = parser(payload.get("min"), defaults["min"])
    max_value = parser(payload.get("max"), defaults["max"])
    if min_value > max_value:
        min_value, max_value = max_value, min_value

    default_value = parser(
        payload.get("default", payload.get("value")),
        defaults["default"],
    )
    default_value = clamp(default_value, min_value, max_value)

    return {
        "min": min_value,
        "max": max_value,
        "default": default_value,
    }


def normalize_scan_settings(payload):
    payload = payload if isinstance(payload, dict) else {}

    return {
        "pages": normalize_range(payload.get("pages"), SCAN_SETTINGS_DEFAULT["pages"], parse_int),
        "depth": normalize_range(payload.get("depth"), SCAN_SETTINGS_DEFAULT["depth"], parse_int),
        "time_limit_seconds": normalize_range(
            payload.get("time_limit_seconds"),
            SCAN_SETTINGS_DEFAULT["time_limit_seconds"],
            parse_float,
        ),
        "min_priority_to_expand": normalize_range(
            payload.get("min_priority_to_expand"),
            SCAN_SETTINGS_DEFAULT["min_priority_to_expand"],
            parse_int,
        ),
        "include_subdomains": parse_bool(
            payload.get("include_subdomains"),
            SCAN_SETTINGS_DEFAULT["include_subdomains"],
        ),
        "requests_per_minute": normalize_range(
            payload.get("requests_per_minute"),
            SCAN_SETTINGS_DEFAULT["requests_per_minute"],
            parse_float,
        ),
        "request_timeout_seconds": normalize_range(
            payload.get("request_timeout_seconds"),
            SCAN_SETTINGS_DEFAULT["request_timeout_seconds"],
            parse_int,
        ),
    }


def load_scan_settings():
    if not os.path.exists(SCAN_SETTINGS_PATH):
        return normalize_scan_settings({})
    try:
        with open(SCAN_SETTINGS_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return normalize_scan_settings(data)
    except Exception:
        return normalize_scan_settings({})


def save_scan_settings(settings):
    with open(SCAN_SETTINGS_PATH, "w", encoding="utf-8") as handle:
        json.dump(settings, handle, indent=2)


def apply_scan_settings(settings):
    requests_per_minute = settings["requests_per_minute"]["default"]
    timeout_seconds = settings["request_timeout_seconds"]["default"]
    POLITE_SCRAPER.timeout = timeout_seconds
    POLITE_SCRAPER.request_interval = 60.0 / max(0.1, requests_per_minute)

def load_urls():
    if not os.path.exists(URL_STORE_PATH):
        return DEFAULT_URLS.copy()
    try:
        with open(URL_STORE_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return DEFAULT_URLS.copy()


def save_urls(urls):
    with open(URL_STORE_PATH, "w", encoding="utf-8") as handle:
        json.dump(urls, handle, indent=2)


def fetch_page_text(url):
    try:
        response = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        return response.text, None
    except Exception as exc:
        return None, str(exc)


def fetch_page_text_polite(url):
    html = POLITE_SCRAPER.get(url)
    if not html:
        return None, "blocked by robots.txt or fetch failed"
    return html, None


def scan_keywords(keywords, urls):
    results = {"matches": [], "errors": [], "scanned": 0}

    for url_entry in urls:
        url = url_entry.get("url") if isinstance(url_entry, dict) else url_entry
        if not url:
            continue
        html, error = fetch_page_text(url)
        if not html:
            html, polite_error = fetch_page_text_polite(url)
            if not html:
                results["errors"].append({"url": url, "error": polite_error or error or "fetch failed"})
                continue

        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text().lower()

        for k in keywords:
            if k.lower() in text:
                results["matches"].append({"keyword": k, "url": url})
        results["scanned"] += 1

    return results


def get_enabled_urls():
    if not URLS:
        URLS.extend(load_urls())
    return [u for u in URLS if u.get("status") == "enabled"]


def normalize_scan_urls(payload_urls):
    if not isinstance(payload_urls, list):
        return None

    normalized = []
    for entry in payload_urls:
        if isinstance(entry, dict):
            url = (entry.get("url") or "").strip()
        else:
            url = str(entry).strip()
        if not url:
            continue
        parsed = urlparse(url)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            normalized.append({"url": url})
        else:
            logging.warning("scan skipped invalid url: %s", url)

    return normalized


def run_scan(
    scan_id,
    keywords,
    urls,
    max_pages,
    min_priority_to_expand,
    include_subdomains,
    time_limit_seconds,
    max_depth,
):
    logging.info("scan %s started with %s url(s)", scan_id, len(urls))
    total = len(urls)
    matches = []
    errors = []
    stats = []

    for index, url_entry in enumerate(urls, start=1):
        url = url_entry.get("url") if isinstance(url_entry, dict) else url_entry
        if not url:
            continue

        with SCANS_LOCK:
            SCANS[scan_id]["progress"] = {
                "current": index,
                "total": total,
                "url": url,
            }

        logging.info("scan %s progress %s/%s: %s", scan_id, index, total, url)

        try:
            report = POLITE_SCRAPER.crawl(
                url,
                keywords,
                max_pages=max_pages,
                min_priority_to_expand=min_priority_to_expand,
                include_subdomains=include_subdomains,
                time_limit_seconds=time_limit_seconds,
                max_depth=max_depth,
                allow_low_value_urls=True,
            )

            for finding in report.findings:
                for keyword in finding.found_keywords:
                    matches.append({"keyword": keyword, "url": finding.url})
            
            # Always append stats, even if pages_scanned is low
            stats.append({
                "url": url,
                "pages_scanned": report.pages_scanned,
                "max_depth_reached": report.max_depth_reached,
                "time_elapsed": report.time_elapsed,
            })
        except Exception as exc:
            logging.error("scan %s failed for url %s: %s", scan_id, url, exc)
            errors.append({"url": url, "error": str(exc)})
            # Even on exception, add minimal stats to show attempt was made
            stats.append({
                "url": url,
                "pages_scanned": 1,
                "max_depth_reached": 0,
                "time_elapsed": 0.01,
            })

        time.sleep(0.1)

    status = "complete"
    with SCANS_LOCK:
        SCANS[scan_id]["status"] = status
        SCANS[scan_id]["matches"] = matches
        SCANS[scan_id]["errors"] = errors
        SCANS[scan_id]["stats"] = stats
        SCANS[scan_id]["completedAt"] = datetime.utcnow().isoformat()

    logging.info(
        "scan %s finished: %s match(es), %s error(s)",
        scan_id,
        len(matches),
        len(errors),
    )


@app.route("/scan", methods=["POST"])
def scan():
    data = request.json or {}
    user_input = data.get("keywords", "")
    keywords = [k.strip() for k in user_input.split(",") if k.strip()]

    settings = SCAN_SETTINGS

    pages_range = settings["pages"]
    max_pages = clamp(
        parse_int(data.get("max_pages"), pages_range["default"]),
        pages_range["min"],
        pages_range["max"],
    )

    time_range = settings["time_limit_seconds"]
    time_limit_seconds = clamp(
        parse_float(data.get("time_limit_seconds"), time_range["default"]),
        time_range["min"],
        time_range["max"],
    )

    include_subdomains = parse_bool(
        data.get("include_subdomains"),
        settings["include_subdomains"],
    )

    priority_range = settings["min_priority_to_expand"]
    min_priority_to_expand = clamp(
        parse_int(data.get("min_priority_to_expand"), priority_range["default"]),
        priority_range["min"],
        priority_range["max"],
    )

    depth_range = settings["depth"]
    max_depth = clamp(
        parse_int(data.get("max_depth"), depth_range["default"]),
        depth_range["min"],
        depth_range["max"],
    )

    urls_payload = data.get("urls")
    urls_to_scan = normalize_scan_urls(urls_payload)
    if not urls_to_scan:
        urls_to_scan = get_enabled_urls()

    if not urls_to_scan:
        return jsonify({"error": "no valid urls to scan"}), 400

    scan_id = uuid.uuid4().hex
    with SCANS_LOCK:
        SCANS[scan_id] = {
            "status": "scanning",
            "matches": [],
            "errors": [],
            "progress": {"current": 0, "total": len(urls_to_scan), "url": None},
            "startedAt": datetime.utcnow().isoformat(),
        }

    worker = threading.Thread(
        target=run_scan,
        args=(
            scan_id,
            keywords,
            urls_to_scan,
            max_pages,
            min_priority_to_expand,
            include_subdomains,
            time_limit_seconds,
            max_depth,
        ),
        daemon=True,
    )
    worker.start()

    logging.info("scan %s queued", scan_id)
    return jsonify({"status": "scanning", "scan_id": scan_id})


@app.route("/scan-status/<scan_id>", methods=["GET"])
def scan_status(scan_id):
    with SCANS_LOCK:
        scan = SCANS.get(scan_id)
    if not scan:
        return jsonify({"error": "scan not found"}), 404
    return jsonify(scan)


@app.route("/api/urls", methods=["GET"])
def get_urls():
    if not URLS:
        URLS.extend(load_urls())
    return jsonify({
        "urls": URLS,
        "total": len(URLS),
        "enabled": len([u for u in URLS if u.get("status") == "enabled"]),
    })


@app.route("/api/urls", methods=["POST"])
def add_url():
    if not URLS:
        URLS.extend(load_urls())
    data = request.json or {}
    url = (data.get("url") or "").strip()
    name = (data.get("name") or "").strip()
    if not url or not name:
        return jsonify({"error": "url and name are required"}), 400

    new_url = {
        "id": str(int(datetime.utcnow().timestamp() * 1000)),
        "url": url,
        "name": name,
        "status": data.get("status", "enabled"),
        "addedAt": datetime.utcnow().isoformat(),
    }
    URLS.append(new_url)
    save_urls(URLS)
    return jsonify({"url": new_url}), 201


@app.route("/api/urls/<url_id>", methods=["PUT"])
def update_url(url_id):
    if not URLS:
        URLS.extend(load_urls())
    data = request.json or {}
    for url in URLS:
        if url.get("id") == url_id:
            url.update({k: v for k, v in data.items() if k in {"url", "name", "status"}})
            save_urls(URLS)
            return jsonify({"url": url})
    return jsonify({"error": "not found"}), 404


@app.route("/api/urls/<url_id>", methods=["DELETE"])
def delete_url(url_id):
    global URLS
    if not URLS:
        URLS.extend(load_urls())
    before = len(URLS)
    URLS = [u for u in URLS if u.get("id") != url_id]
    if len(URLS) == before:
        return jsonify({"error": "not found"}), 404
    save_urls(URLS)
    return jsonify({"ok": True})


@app.route("/api/urls/<url_id>/toggle", methods=["PATCH"])
def toggle_url(url_id):
    if not URLS:
        URLS.extend(load_urls())
    for url in URLS:
        if url.get("id") == url_id:
            url["status"] = "disabled" if url.get("status") == "enabled" else "enabled"
            save_urls(URLS)
            return jsonify({"url": url})
    return jsonify({"error": "not found"}), 404


@app.route("/api/scan-settings", methods=["GET"])
def get_scan_settings():
    return jsonify({"settings": SCAN_SETTINGS})


@app.route("/api/scan-settings", methods=["PUT"])
def update_scan_settings():
    global SCAN_SETTINGS
    data = request.json or {}
    updated = normalize_scan_settings(data)
    SCAN_SETTINGS = updated
    save_scan_settings(SCAN_SETTINGS)
    apply_scan_settings(SCAN_SETTINGS)
    return jsonify({"settings": SCAN_SETTINGS})


URLS = load_urls()
SCAN_SETTINGS = load_scan_settings()
apply_scan_settings(SCAN_SETTINGS)


if __name__ == "__main__":
    app.run(debug=True)
