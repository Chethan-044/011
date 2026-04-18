"""
Feature keyword maps and helpers for aspect detection in review text.
Used by SentimentAnalyzer for ABSA routing.
"""
import re
from typing import Dict, List, Tuple

FEATURE_KEYWORDS: Dict[str, List[str]] = {
    "battery_life": [
        "battery",
        "charge",
        "charging",
        "mah",
        "drain",
        "power",
        "backup",
        "last",
        "hours",
        "overnight",
        "baterry",
    ],
    "packaging": [
        "packaging",
        "package",
        "box",
        "wrapped",
        "packing",
        "bubble",
        "damage",
        "open",
        "seal",
        "unbox",
        "pkng",
    ],
    "delivery_speed": [
        "delivery",
        "shipping",
        "arrive",
        "arrived",
        "days",
        "fast",
        "slow",
        "delay",
        "courier",
        "dispatch",
        "shipped",
        "transit",
        "received",
        "dlvry",
    ],
    "build_quality": [
        "build",
        "quality",
        "material",
        "sturdy",
        "durable",
        "plastic",
        "metal",
        "feel",
        "finish",
        "solid",
        "flimsy",
        "qlt",
    ],
    "customer_support": [
        "support",
        "service",
        "customer",
        "help",
        "response",
        "refund",
        "return",
        "exchange",
        "complaint",
        "resolved",
    ],
    "price_value": [
        "price",
        "cost",
        "worth",
        "value",
        "expensive",
        "cheap",
        "affordable",
        "money",
        "budget",
        "overpriced",
    ],
    "taste_flavor": [
        "taste",
        "flavor",
        "flavour",
        "sweet",
        "salty",
        "spicy",
        "bitter",
        "fresh",
        "stale",
        "delicious",
        "yummy",
    ],
    "size_fit": [
        "size",
        "fit",
        "fitting",
        "large",
        "small",
        "tight",
        "loose",
        "length",
        "measurements",
        "xl",
        "medium",
    ],
    "display_screen": [
        "display",
        "screen",
        "resolution",
        "brightness",
        "color",
        "pixel",
        "hd",
        "amoled",
        "lcd",
        "refresh",
    ],
    "camera_quality": [
        "camera",
        "photo",
        "picture",
        "video",
        "lens",
        "zoom",
        "selfie",
        "megapixel",
        "clarity",
        "focus",
        "cmra",
    ],
    "performance_speed": [
        "performance",
        "speed",
        "fast",
        "slow",
        "lag",
        "hang",
        "smooth",
        "processor",
        "ram",
        "loading",
        "spd",
    ],
    "fragrance_smell": [
        "smell",
        "fragrance",
        "scent",
        "odor",
        "aroma",
        "perfume",
        "fresh",
        "stink",
        "nice smell",
    ],
}


def find_mentioned_features(text: str) -> List[Tuple[str, List[str]]]:
    """
    Return list of (feature_key, matched_keywords) for features present in text.
    Case-insensitive whole-word style matching where possible.
    """
    lowered = text.lower()
    found: List[Tuple[str, List[str]]] = []
    for feature, keywords in FEATURE_KEYWORDS.items():
        matched = []
        for kw in keywords:
            pattern = r"(?<!\w)" + re.escape(kw.lower()) + r"(?!\w)"
            if re.search(pattern, lowered) or kw.lower() in lowered:
                if kw.lower() not in [m.lower() for m in matched]:
                    matched.append(kw)
        if matched:
            found.append((feature, matched))
    return found


def extract_snippet_for_keyword(text: str, keyword: str) -> str:
    """Return the sentence (or chunk) containing the first keyword hit."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    kw_low = keyword.lower()
    for s in sentences:
        if kw_low in s.lower():
            return s.strip()
    for i, line in enumerate(text.split("\n")):
        if kw_low in line.lower():
            return line.strip()
    return text[:200] + ("..." if len(text) > 200 else "")
