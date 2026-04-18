"""
Text cleaning: emoji expansion, slang, repetition collapse, language detect, Hindi/Hinglish translation.
"""
import logging
import re
from typing import Any, Dict, List

from deep_translator import GoogleTranslator
from langdetect import DetectorFactory, LangDetectException, detect

from emoji import replace_emoji

DetectorFactory.seed = 0

logger = logging.getLogger(__name__)

EMOJI_MAP = {
    "\U0001f60d": "love it",
    "\U0001f621": "very angry",
    "\U0001f44d": "good",
    "\U0001f44e": "bad",
    "\U0001f494": "disappointed",
    "\u2b50": "star rated",
    "\U0001f525": "amazing",
    "\U0001f62d": "sad experience",
    "\U0001f60a": "happy",
    "\U0001f92e": "disgusting",
    "\U0001f4af": "perfect",
    "\U0001f624": "frustrated",
    "\U0001f644": "annoyed",
    "\U0001f629": "terrible experience",
    "\u2728": "great",
    "\U0001f4e6": "packaging issue",
    "\U0001f69a": "delivery issue",
    "\U0001f4aa": "durable",
    "\U0001f5d1\ufe0f": "trash quality",
    "\u2764\ufe0f": "love",
    "\U0001f610": "okay",
    "\u26a1": "fast",
    "\U0001f422": "slow",
    "\U0001f4b8": "expensive",
    "\U0001f381": "gift",
}

SLANG_MAP = {
    "gud": "good",
    "gr8": "great",
    "grt": "great",
    "awsm": "awesome",
    "amazng": "amazing",
    "wrst": "worst",
    "thx": "thanks",
    "plz": "please",
    "ur": "your",
    "bcoz": "because",
    "coz": "because",
    "wid": "with",
    "dis": "this",
    "dat": "that",
    "nt": "not",
    "dnt": "dont",
    "vry": "very",
    "avg": "average",
    "qty": "quality",
    "qlt": "quality",
    "dlvry": "delivery",
    "pkng": "packaging",
    "prdct": "product",
    "bttry": "battery",
    "cmra": "camera",
    "spd": "speed",
    "wrks": "works",
    "doesnt": "does not",
    "cant": "cannot",
    "wont": "will not",
    "isnt": "is not",
    "ok": "okay",
    "okk": "okay",
    "toh": "then",
    "hai": "is",
    "tha": "was",
    "nahi": "not",
    "bahut": "very",
    "acha": "good",
    "accha": "good",
    "bura": "bad",
    "jaldi": "fast",
    "dheere": "slow",
    "baterry": "battery",
}

DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]+")
LATIN_RE = re.compile(r"[A-Za-z]{2,}")

HINDI_HINT_WORDS = {
    "hai",
    "hain",
    "nahi",
    "nahin",
    "accha",
    "acha",
    "bahut",
    "lekin",
    "magar",
    "par",
    "ekdum",
    "tha",
    "thi",
    "hoti",
    "hota",
}


class PreprocessorService:
    """Stateful service for review text normalization."""

    def replace_emojis(self, text: str) -> str:
        """Replace known emojis with textual equivalents."""
        out = text
        for emo, phrase in EMOJI_MAP.items():
            out = out.replace(emo, f" {phrase} ")
        out = replace_emoji(out, replace="")
        return out

    def fix_slang(self, text: str) -> str:
        """Apply word-by-word slang dictionary."""
        tokens = re.findall(r"\S+|\s+", text)
        result: List[str] = []
        for tok in tokens:
            if tok.isspace():
                result.append(tok)
                continue
            punct_match = re.match(r"^([^A-Za-z0-9]*)([A-Za-z0-9']+)([^A-Za-z0-9]*)$", tok)
            if punct_match:
                pre, word, post = punct_match.groups()
                key = word.lower()
                replacement = SLANG_MAP.get(key, word)
                if replacement != word and word and word[0].isupper():
                    replacement = replacement.capitalize()
                result.append(f"{pre}{replacement}{post}")
            else:
                result.append(tok)
        return "".join(result)

    def collapse_repeats(self, text: str) -> str:
        """Collapse stretched characters like sooooo -> so."""
        return re.sub(r"(.)\1{2,}", r"\1", text)

    def normalize_whitespace_punct(self, text: str) -> str:
        """Trim and normalize spaces around punctuation."""
        t = re.sub(r"\s+", " ", text).strip()
        t = re.sub(r"\s+([.,!?;:])", r"\1", t)
        return t

    def detect_language(self, text: str) -> str:
        """
        Detect language: en, hi, hinglish, or other.
        Hinglish: Latin + Devanagari mix or Hindi particles with English words.
        """
        if not text or not text.strip():
            return "other"

        has_dev = bool(DEVANAGARI_RE.search(text))
        has_lat = bool(LATIN_RE.search(text))

        if has_dev and has_lat:
            return "hinglish"

        lowered = text.lower()
        words = set(re.findall(r"[a-z']+", lowered))
        if has_lat and words & HINDI_HINT_WORDS and len(words) > 3:
            return "hinglish"

        try:
            code = detect(text)
        except LangDetectException:
            return "other"

        if code == "hi":
            return "hi"
        if code == "en":
            if has_dev:
                return "hinglish"
            return "en"
        return "other"

    def translate_hindi(self, text: str) -> str:
        """Translate Hindi text to English via GoogleTranslator."""
        try:
            return GoogleTranslator(source="hi", target="en").translate(text)
        except Exception as exc:
            logger.warning("Translation failed: %s", exc)
            return text

    def clean_text(self, text: str) -> Dict[str, Any]:
        """
        Full cleaning pipeline returning metadata dict.
        """
        original_text = text or ""
        step1 = self.replace_emojis(original_text)
        step2 = self.fix_slang(step1)
        step3 = self.collapse_repeats(step2)
        step4 = self.normalize_whitespace_punct(step3)
        lang = self.detect_language(step4)
        was_translated = False
        translation_note = ""
        cleaned = step4

        if lang in ("hi", "hinglish"):
            translated = self.translate_hindi(step4)
            if translated and translated != step4:
                cleaned = self.normalize_whitespace_punct(translated)
                was_translated = True
                translation_note = f"Translated from {lang} to English"
            else:
                translation_note = "Translation skipped or unchanged"

        return {
            "original_text": original_text,
            "cleaned_text": cleaned,
            "detected_language": lang,
            "was_translated": was_translated,
            "translation_note": translation_note,
        }

    def batch_clean(self, reviews: List[Any]) -> List[Dict[str, Any]]:
        """Run clean_text on a list of review dicts or raw strings."""
        results: List[Dict[str, Any]] = []
        for item in reviews:
            if isinstance(item, dict):
                raw = item.get("text") or item.get("originalText") or item.get("review") or ""
            else:
                raw = str(item)
            cleaned = self.clean_text(raw)
            if isinstance(item, dict):
                merged = {**item, **cleaned}
            else:
                merged = cleaned
            results.append(merged)
        return results
