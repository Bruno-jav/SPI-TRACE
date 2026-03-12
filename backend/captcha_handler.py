"""
Captcha handling helpers for DarkWatch scraping workflows.

This module focuses on detecting captcha challenges, downloading the related
image asset, and preparing it for manual review so the scraper can pause and
resume safely. It does not automate solving or submitting captchas because
that would bypass an anti-bot protection.

Integration note:
    The existing scraper module in this workspace is polite_scraper.py, so this
    file is designed to be imported there or from app.py where needed.
"""

from __future__ import annotations

import logging
import os
import tempfile
from typing import Any, Dict, Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

try:
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None

try:
    import pytesseract
except ImportError:  # pragma: no cover
    pytesseract = None

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
LOGGER = logging.getLogger(__name__)


CAPTCHA_KEYWORDS = (
    "captcha",
    "verify you are human",
    "i am not a robot",
    "human verification",
    "security check",
    "challenge",
)


def detect_captcha(html: str) -> Dict[str, Any]:
    """
    Detect whether a page appears to contain a captcha challenge.

    The detection is heuristic-based. It checks for common keywords, form field
    names, and captcha-like image elements.
    """
    soup = BeautifulSoup(html or "", "html.parser")
    page_text = soup.get_text(" ", strip=True).lower()

    reasons = []
    image_url = None
    form_action = None

    if any(keyword in page_text for keyword in CAPTCHA_KEYWORDS):
        reasons.append("keyword_match")

    captcha_input = soup.find(
        lambda tag: tag.name in {"input", "textarea"}
        and any(
            "captcha" in str(tag.get(attribute, "")).lower()
            for attribute in ("name", "id", "placeholder", "aria-label")
        )
    )
    if captcha_input is not None:
        reasons.append("captcha_input_field")
        form = captcha_input.find_parent("form")
        if form is not None:
            form_action = form.get("action")

    captcha_image = soup.find(
        lambda tag: tag.name == "img"
        and any(
            "captcha" in str(tag.get(attribute, "")).lower()
            for attribute in ("src", "alt", "id", "class")
        )
    )
    if captcha_image is not None:
        reasons.append("captcha_image")
        image_url = captcha_image.get("src")

    detected = bool(reasons)
    if detected:
        LOGGER.info("Captcha detected with reasons: %s", ", ".join(reasons))
    else:
        LOGGER.info("No captcha detected in the provided page HTML.")

    return {
        "detected": detected,
        "reasons": reasons,
        "image_url": image_url,
        "form_action": form_action,
    }


def download_captcha_image(image_url: str) -> Optional[str]:
    """
    Download a captcha image for inspection.

    The downloaded file is normalized into a temporary PNG copy when Pillow and
    OpenCV are available, which makes manual review easier.
    """
    if not image_url:
        LOGGER.warning("No captcha image URL provided for download.")
        return None

    try:
        response = requests.get(image_url, timeout=20)
        response.raise_for_status()
    except requests.RequestException as exc:
        LOGGER.error("Failed to download captcha image %s: %s", image_url, exc)
        return None

    temp_dir = tempfile.gettempdir()
    raw_path = os.path.join(temp_dir, "darkwatch_captcha_raw.bin")
    with open(raw_path, "wb") as handle:
        handle.write(response.content)

    normalized_path = os.path.join(temp_dir, "darkwatch_captcha.png")

    if Image is None:
        LOGGER.warning("Pillow is not installed. Returning raw downloaded file.")
        return raw_path

    try:
        with Image.open(raw_path) as image:
            grayscale = image.convert("L")
            grayscale.save(normalized_path)
    except Exception as exc:
        LOGGER.error("Failed to normalize captcha image with Pillow: %s", exc)
        return raw_path

    if cv2 is not None:
        try:
            image_matrix = cv2.imread(normalized_path, cv2.IMREAD_GRAYSCALE)
            if image_matrix is not None:
                cleaned = cv2.threshold(image_matrix, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
                cv2.imwrite(normalized_path, cleaned)
        except Exception as exc:
            LOGGER.warning("OpenCV preprocessing failed; using Pillow output: %s", exc)

    LOGGER.info("Captcha image saved to %s", normalized_path)
    return normalized_path


def solve_captcha(image_path: str) -> Optional[str]:
    """
    Placeholder for captcha solving.

    Automatic captcha solving is intentionally not performed here. If you want a
    human-in-the-loop workflow, this function can be extended to read a manual
    answer from a trusted operator or secure review queue.
    """
    if not image_path:
        LOGGER.warning("No captcha image path provided to solve_captcha.")
        return None

    if pytesseract is None:
        LOGGER.info("pytesseract is not installed. Manual review is required for %s", image_path)
        return None

    LOGGER.info(
        "Captcha image prepared at %s. Manual review is required before continuing.",
        image_path,
    )
    return None


def submit_captcha_solution(session: requests.Session, form_url: str, captcha_text: str) -> bool:
    """
    Placeholder for captcha submission.

    This module intentionally does not submit captcha solutions automatically.
    Callers should instead stop the automated workflow and route the challenge
    to a trusted manual review step.
    """
    _ = session
    _ = form_url
    _ = captcha_text
    LOGGER.warning("Automatic captcha submission is not supported in this module.")
    return False


def handle_captcha(page_html: str, session: requests.Session) -> Dict[str, Any]:
    """
    Coordinate captcha detection and prepare a manual-review workflow.

    Return shape is designed for easy integration with scraping code:
    - captcha_detected: whether a challenge was found
    - captcha_image_path: downloaded asset for operator review
    - captcha_text: always None in this safe implementation
    - solved: always False in this safe implementation
    - can_continue: False when manual review is required
    """
    _ = session

    detection = detect_captcha(page_html)
    if not detection["detected"]:
        return {
            "captcha_detected": False,
            "captcha_image_path": None,
            "captcha_text": None,
            "solved": False,
            "can_continue": True,
            "form_url": None,
            "message": "No captcha detected.",
        }

    image_url = detection.get("image_url")
    image_path = download_captcha_image(image_url) if image_url else None
    captcha_text = solve_captcha(image_path) if image_path else None

    if captcha_text:
        submitted = submit_captcha_solution(session, detection.get("form_action") or "", captcha_text)
        return {
            "captcha_detected": True,
            "captcha_image_path": image_path,
            "captcha_text": captcha_text,
            "solved": submitted,
            "can_continue": submitted,
            "form_url": detection.get("form_action"),
            "message": "Captcha text prepared and submission attempted.",
        }

    LOGGER.info("Captcha challenge requires manual review before scraping can continue.")
    return {
        "captcha_detected": True,
        "captcha_image_path": image_path,
        "captcha_text": None,
        "solved": False,
        "can_continue": False,
        "form_url": detection.get("form_action"),
        "message": "Captcha detected. Manual review required.",
    }


def resolve_relative_captcha_url(page_url: str, image_url: str) -> str:
    """Helper for callers that need to expand a relative captcha image URL."""
    return urljoin(page_url, image_url)