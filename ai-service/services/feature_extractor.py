"""
Feature keyword maps and helpers for aspect detection in review text.
Used by SentimentAnalyzer for ABSA routing.

Supports domain-aware feature extraction — hospitality (hotels, restaurants)
vs product (electronics, etc.) domains are detected automatically from the
product name or review content.
"""
import re
from typing import Dict, List, Optional, Tuple

# ── Hospitality domain features (hotels, restaurants, cafes, resorts) ──
HOSPITALITY_FEATURE_KEYWORDS: Dict[str, List[str]] = {
    "food_quality": [
        "food", "dish", "dishes", "meal", "meals", "cuisine", "menu",
        "tasty", "delicious", "yummy", "bland", "stale", "undercooked",
        "overcooked", "flavorful", "flavourful", "biryani", "dosa",
        "thali", "naan", "roti", "curry", "rice", "paneer", "chicken",
        "mutton", "fish", "starter", "dessert", "buffet", "breakfast",
        "lunch", "dinner", "south indian", "north indian", "continental",
        "chinese", "tandoori", "appetizer", "main course", "gravy",
        "spicy", "sweet", "salty", "bitter", "sour", "fresh", "stale",
        "portion", "portions", "plating", "presentation",
    ],
    "service_quality": [
        "service", "staff", "waiter", "waitress", "server", "manager",
        "polite", "rude", "attentive", "friendly", "helpful", "courteous",
        "prompt", "responsive", "hospitable", "quick", "slow service",
        "ignored", "inattentive", "greeting", "welcoming", "thoughtful",
        "accommodating", "professional", "caring",
    ],
    "ambiance": [
        "ambiance", "ambience", "atmosphere", "vibe", "decor", "decoration",
        "interior", "lighting", "music", "noise", "noisy", "quiet",
        "cozy", "cosy", "elegant", "theme", "romantic", "family friendly",
        "rooftop", "outdoor", "indoor", "seating", "spacious", "cramped",
        "beautiful", "aesthetic", "instagram", "view", "scenic",
        "relaxed", "relaxing", "calm", "lively",
    ],
    "cleanliness": [
        "clean", "dirty", "hygiene", "hygienic", "sanitation", "tidy",
        "messy", "spotless", "washroom", "restroom", "bathroom", "toilet",
        "dusty", "grimy", "neat", "maintained", "cockroach", "insect",
        "flies", "unhygienic",
    ],
    "price_value": [
        "price", "pricing", "cost", "worth", "value", "expensive",
        "cheap", "affordable", "money", "budget", "overpriced",
        "reasonable", "bill", "charge", "charges", "charged",
        "pocket friendly", "value for money", "costly",
    ],
    "location_parking": [
        "location", "parking", "park", "parked", "access", "accessible",
        "easy to find", "hard to find", "address", "navigation",
        "central", "convenient", "area", "locality", "traffic",
        "valet", "basement parking", "space",
    ],
    "drinks_beverages": [
        "drink", "drinks", "beverage", "beverages", "cocktail",
        "mocktail", "juice", "smoothie", "coffee", "tea", "chai",
        "lassi", "beer", "wine", "alcohol", "bar", "soda",
        "water", "shake", "milkshake",
    ],
    "wait_time": [
        "wait", "waiting", "waited", "queue", "reservation",
        "booking", "table", "seated", "turnaround", "long wait",
        "quick service", "delay", "delayed",
    ],
    "room_quality": [
        "room", "bed", "bedroom", "suite", "ac", "air conditioning",
        "towel", "linen", "pillow", "mattress", "balcony", "mini bar",
        "room service", "check in", "check out", "checkout", "checkin",
        "housekeeping", "wifi", "wi-fi", "internet", "amenities",
        "swimming pool", "pool", "gym", "spa", "hot water",
    ],
}

# ── Product / E-commerce domain features ──
PRODUCT_FEATURE_KEYWORDS: Dict[str, List[str]] = {
    "battery_life": [
        "battery", "charge", "charging", "mah", "drain", "power",
        "backup", "last", "hours", "overnight", "baterry",
    ],
    "packaging": [
        "packaging", "package", "box", "wrapped", "packing", "bubble",
        "damage", "open", "seal", "unbox", "pkng",
    ],
    "delivery_speed": [
        "delivery", "shipping", "arrive", "arrived", "days", "fast",
        "slow", "delay", "courier", "dispatch", "shipped", "transit",
        "received", "dlvry",
    ],
    "build_quality": [
        "build", "quality", "material", "sturdy", "durable", "plastic",
        "metal", "feel", "finish", "solid", "flimsy", "qlt",
    ],
    "customer_support": [
        "support", "service", "customer", "help", "response", "refund",
        "return", "exchange", "complaint", "resolved",
    ],
    "price_value": [
        "price", "cost", "worth", "value", "expensive", "cheap",
        "affordable", "money", "budget", "overpriced",
    ],
    "taste_flavor": [
        "taste", "flavor", "flavour", "sweet", "salty", "spicy",
        "bitter", "fresh", "stale", "delicious", "yummy",
    ],
    "size_fit": [
        "size", "fit", "fitting", "large", "small", "tight", "loose",
        "length", "measurements", "xl", "medium",
    ],
    "display_screen": [
        "display", "screen", "resolution", "brightness", "color",
        "pixel", "hd", "amoled", "lcd", "refresh",
    ],
    "camera_quality": [
        "camera", "photo", "picture", "video", "lens", "zoom",
        "selfie", "megapixel", "clarity", "focus", "cmra",
    ],
    "performance_speed": [
        "performance", "speed", "fast", "slow", "lag", "hang",
        "smooth", "processor", "ram", "loading", "spd",
    ],
    "fragrance_smell": [
        "smell", "fragrance", "scent", "odor", "aroma", "perfume",
        "fresh", "stink", "nice smell",
    ],
}

# Legacy alias — kept for backward compatibility
FEATURE_KEYWORDS = PRODUCT_FEATURE_KEYWORDS

# ── Hospitality signal keywords ──
_HOSPITALITY_SIGNALS = {
    "restaurant", "restaurants", "hotel", "hotels", "cafe", "cafes",
    "resort", "resorts", "bar", "pub", "dhaba", "diner", "bistro",
    "eatery", "food court", "inn", "lodge", "motel", "hostel",
    "bakery", "pizzeria", "kitchen", "dining", "gufha", "paaka",
    "waiter", "chef", "buffet", "menu", "dish", "cuisine", "dosa",
    "biryani", "thali", "roti", "naan", "curry", "paneer", "tandoori",
    "ambiance", "ambience", "vibe",
}


def detect_domain(product_name: str = "", review_text: str = "") -> str:
    """
    Determine whether this review belongs to the 'hospitality' domain
    or the generic 'product' domain, based on the product/business name
    and optionally the review text itself.
    """
    combined = f"{product_name} {review_text}".lower()
    hits = sum(1 for kw in _HOSPITALITY_SIGNALS if kw in combined)
    # Even 1 strong signal from the product name is enough
    name_lower = product_name.lower()
    for sig in _HOSPITALITY_SIGNALS:
        if sig in name_lower:
            return "hospitality"
    # Fallback: check review text — need at least 2 signals
    if hits >= 2:
        return "hospitality"
    return "product"


def get_feature_keywords(domain: str = "product") -> Dict[str, List[str]]:
    """Return the correct feature keyword map for the domain."""
    if domain == "hospitality":
        return HOSPITALITY_FEATURE_KEYWORDS
    return PRODUCT_FEATURE_KEYWORDS


def find_mentioned_features(
    text: str,
    product_name: str = "",
    domain: Optional[str] = None,
) -> List[Tuple[str, List[str]]]:
    """
    Return list of (feature_key, matched_keywords) for features present in text.
    Auto-detects domain from product_name if domain is not explicitly set.
    """
    if domain is None:
        domain = detect_domain(product_name, text)

    keyword_map = get_feature_keywords(domain)
    lowered = text.lower()
    found: List[Tuple[str, List[str]]] = []

    for feature, keywords in keyword_map.items():
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
