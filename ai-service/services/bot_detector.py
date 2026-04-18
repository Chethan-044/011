"""
Heuristic bot and spam detection for review batches.
"""
import re
from collections import Counter, defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fuzzywuzzy import fuzz


GENERIC_BOT_PHRASES = [
    "great product",
    "highly recommend",
    "five stars",
    "best product ever",
    "love it love it",
]


class BotDetectorService:
    """Apply rule-based bot signals to a list of reviews."""

    def _word_count(self, text: str) -> int:
        return len(re.findall(r"\b\w+\b", text or ""))

    def _uppercase_ratio(self, text: str) -> float:
        letters = [c for c in text if c.isalpha()]
        if not letters:
            return 0.0
        up = sum(1 for c in letters if c.isupper())
        return up / len(letters)

    def _find_repetitive_phrases(self, text: str) -> bool:
        words = re.findall(r"\w+", text.lower())
        for n in range(3, min(8, len(words) // 3 + 1)):
            for i in range(len(words) - n * 3 + 1):
                phrase = tuple(words[i : i + n])
                count = 1
                j = i + n
                while j + n <= len(words):
                    if tuple(words[j : j + n]) == phrase:
                        count += 1
                        j += n
                    else:
                        j += 1
                if count >= 3:
                    return True
        return False

    def _only_rating(self, text: str) -> bool:
        t = (text or "").strip().lower()
        if not t:
            return True
        patterns = [
            r"^\d+\s*stars?$",
            r"^five stars$",
            r"^good$",
            r"^bad$",
            r"^ok$",
            r"^okay$",
        ]
        if len(t.split()) <= 1 and t in {"good", "bad", "ok", "okay", "nice"}:
            return True
        return any(re.match(p, t) for p in patterns)

    def _generic_bot_only(self, text: str) -> bool:
        t = (text or "").strip().lower()
        if not t:
            return False
        for phrase in GENERIC_BOT_PHRASES:
            if phrase in t:
                remainder = t
                for g in sorted(GENERIC_BOT_PHRASES, key=len, reverse=True):
                    remainder = remainder.replace(g, "")
                remainder = re.sub(r"[^\w\s]", "", remainder).strip()
                if remainder == "" or len(remainder.split()) <= 2:
                    return True
        return False

    def _parse_date(self, review: Dict[str, Any]) -> Optional[datetime]:
        for key in ("reviewDate", "date", "created_at", "timestamp"):
            val = review.get(key)
            if not val:
                continue
            if isinstance(val, datetime):
                return val
            if isinstance(val, str):
                try:
                    return datetime.fromisoformat(val.replace("Z", "+00:00"))
                except ValueError:
                    continue
        return None

    def detect_bots(self, reviews: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Annotate each review with bot flags, confidence, reasons, severity.
        """
        texts: List[str] = []
        for r in reviews:
            t = r.get("cleaned_text") or r.get("text") or r.get("originalText") or ""
            texts.append(t)

        text_counts = Counter(texts)
        output: List[Dict[str, Any]] = []

        for idx, review in enumerate(reviews):
            text = texts[idx]
            flags: List[Tuple[str, str, str]] = []

            if self._word_count(text) < 3:
                flags.append(("TOO_SHORT", "Review too short to be genuine", "low"))

            if self._uppercase_ratio(text) > 0.7 and len(text) > 10:
                flags.append(("ALL_CAPS", "Suspicious all-caps text", "low"))

            if text_counts[text] > 1:
                flags.append(("EXACT_DUPLICATE", "Exact duplicate of another review", "high"))

            best_ratio = 0
            best_j = -1
            for j, other in enumerate(texts):
                if j == idx:
                    continue
                ratio = fuzz.ratio(text.lower(), other.lower())
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_j = j
            if (
                best_ratio > 88
                and best_j >= 0
                and text.lower() != texts[best_j].lower()
                and not any(f[0] == "EXACT_DUPLICATE" for f in flags)
            ):
                flags.append(
                    (
                        "NEAR_DUPLICATE",
                        f"Near-duplicate ({best_ratio}% similar to review #{best_j + 1})",
                        "medium",
                    )
                )

            if self._find_repetitive_phrases(text):
                flags.append(("REPETITIVE_PHRASES", "Repetitive pattern detected", "medium"))

            if self._only_rating(text):
                flags.append(("ONLY_RATING", "No meaningful content", "low"))

            if self._generic_bot_only(text):
                flags.append(("GENERIC_BOT_PHRASES", "Generic bot-like phrasing", "medium"))

            enriched = {**review, "text_for_bot": text}

            output.append(
                {
                    "review": enriched,
                    "flags": flags,
                    "index": idx,
                }
            )

        # Burst detection: group by hour/day with similar length & sentiment placeholder
        buckets: Dict[str, List[int]] = defaultdict(list)
        for idx, review in enumerate(reviews):
            dt = self._parse_date(review)
            key = ""
            if dt:
                key = dt.strftime("%Y-%m-%d-%H")
            else:
                key = "unknown"
            buckets[key].append(idx)

        for key, indices in buckets.items():
            if key == "unknown" or len(indices) < 5:
                continue
            lengths = [len(texts[i].split()) for i in indices]
            mean_len = sum(lengths) / len(lengths)
            similar_len = sum(1 for L in lengths if abs(L - mean_len) <= max(2, mean_len * 0.2))
            if similar_len >= 5:
                for i in indices:
                    entry = output[i]
                    if not any(f[0] == "BURST_DETECTION" for f in entry["flags"]):
                        entry["flags"].append(
                            (
                                "BURST_DETECTION",
                                "Possible review burst/spam campaign",
                                "high",
                            )
                        )

        final: List[Dict[str, Any]] = []
        for entry in output:
            flags = entry["flags"]
            rev = entry["review"]
            is_bot = len(flags) > 0
            reasons = [f[1] for f in flags]
            severities = [f[2] for f in flags]
            severity_order = {"high": 3, "medium": 2, "low": 1, "clean": 0}
            bot_severity = "clean"
            if severities:
                bot_severity = max(severities, key=lambda s: severity_order.get(s, 0))
            confidence = min(1.0, 0.25 * len(flags))
            if any(f[0] == "EXACT_DUPLICATE" for f in flags):
                confidence = max(confidence, 0.9)
            if any(f[0] == "BURST_DETECTION" for f in flags):
                confidence = max(confidence, 0.75)

            final.append(
                {
                    **rev,
                    "is_bot": is_bot,
                    "bot_confidence": round(confidence, 3),
                    "bot_reasons": reasons,
                    "bot_severity": bot_severity if is_bot else "clean",
                }
            )

        return final

    def get_bot_summary(self, reviews_with_flags: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Aggregate bot statistics for the batch."""
        total = len(reviews_with_flags)
        flagged = sum(1 for r in reviews_with_flags if r.get("is_bot"))
        clean = total - flagged
        pct = round((flagged / total) * 100, 2) if total else 0.0
        breakdown = {"low": 0, "medium": 0, "high": 0}
        for r in reviews_with_flags:
            if not r.get("is_bot"):
                continue
            sev = r.get("bot_severity") or "low"
            if sev in breakdown:
                breakdown[sev] += 1

        if pct > 25:
            recommendation = "High bot/spam ratio — validate data source and exclude flagged reviews from KPIs."
        elif pct > 10:
            recommendation = "Moderate bot signals — review flagged entries before trusting aggregate sentiment."
        else:
            recommendation = "Bot levels look normal; continue monitoring duplicate and burst patterns."

        return {
            "total_reviews": total,
            "bot_flagged": flagged,
            "clean_reviews": clean,
            "bot_percentage": pct,
            "severity_breakdown": breakdown,
            "recommendation": recommendation,
        }
