"""
Geographic inference from review text and aggregation of regional insights.
"""
import logging
import re
from collections import defaultdict
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)

INDIA_CITIES = {
    "bangalore": "Karnataka",
    "bengaluru": "Karnataka",
    "mysuru": "Karnataka",
    "mysore": "Karnataka",
    "mumbai": "Maharashtra",
    "pune": "Maharashtra",
    "delhi": "Delhi",
    "new delhi": "Delhi",
    "hyderabad": "Telangana",
    "chennai": "Tamil Nadu",
    "kolkata": "West Bengal",
    "ahmedabad": "Gujarat",
    "jaipur": "Rajasthan",
    "lucknow": "Uttar Pradesh",
    "kochi": "Kerala",
    "coimbatore": "Tamil Nadu",
    "nagpur": "Maharashtra",
    "surat": "Gujarat",
    "visakhapatnam": "Andhra Pradesh",
    "bhopal": "Madhya Pradesh",
    "patna": "Bihar",
    "indore": "Madhya Pradesh",
    "vadodara": "Gujarat",
    "agra": "Uttar Pradesh",
}


class GeoAnalyzer:
    """Lightweight geo tagging without external APIs."""

    def extract_location(self, review_text: str, metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """Find city/state mentions in text or metadata.location."""
        meta = metadata or {}
        loc_field = (meta.get("reviewerLocation") or meta.get("location") or "").lower()
        haystack = f"{review_text} {loc_field}".lower()
        found_city = ""
        found_state = ""
        for city, state in INDIA_CITIES.items():
            pattern = r"(?<!\w)" + re.escape(city) + r"(?!\w)"
            if re.search(pattern, haystack):
                found_city = city.title()
                found_state = state
                break
        if not found_city and loc_field:
            for city, state in INDIA_CITIES.items():
                if city in loc_field:
                    found_city = city.title()
                    found_state = state
                    break
        return {"city": found_city, "state": found_state, "found": bool(found_city or found_state)}

    def aggregate_geo_insights(self, analyzed_reviews: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Roll up metrics by state/city with heuristic alerts."""
        by_state: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {
                "total_reviews": 0,
                "avg_sentiment_score": 0.0,
                "top_complaints": [],
                "top_praises": [],
                "dominant_feature_issues": [],
                "_scores": [],
                "_neg_feats": defaultdict(int),
                "_pos_feats": defaultdict(int),
            }
        )
        by_city: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {
                "total_reviews": 0,
                "avg_sentiment_score": 0.0,
                "top_complaints": [],
                "top_praises": [],
                "dominant_feature_issues": [],
                "_scores": [],
                "_neg_feats": defaultdict(int),
                "_pos_feats": defaultdict(int),
            }
        )

        for entry in analyzed_reviews:
            rev = entry.get("review_ref") or {}
            text = rev.get("cleaned_text") or rev.get("text") or ""
            geo = rev.get("geoLocation") or self.extract_location(text, rev)
            state = geo.get("state") or ""
            city = geo.get("city") or ""
            if not state and not city:
                continue

            score = 0.0
            sent = (entry.get("overall_sentiment") or {}).get("sentiment", "NEUTRAL")
            if sent == "POSITIVE":
                score = 1.0
            elif sent == "NEGATIVE":
                score = -1.0
            elif sent == "SARCASTIC":
                score = -0.5

            buckets: List[Tuple[str, Dict[str, Any]]] = []
            if state:
                buckets.append((state, by_state[state]))
            if city:
                buckets.append((city, by_city[city]))

            for _, bucket in buckets:
                bucket["total_reviews"] += 1
                bucket["_scores"].append(score)
                for f in entry.get("features", []):
                    if f.get("sentiment") == "NEGATIVE":
                        bucket["_neg_feats"][f.get("feature")] += 1
                    if f.get("sentiment") == "POSITIVE":
                        bucket["_pos_feats"][f.get("feature")] += 1

        def finalize(bucket: Dict[str, Any]) -> None:
            scores = bucket.pop("_scores", [])
            neg = bucket.pop("_neg_feats", {})
            pos = bucket.pop("_pos_feats", {})
            bucket["avg_sentiment_score"] = round(sum(scores) / len(scores), 3) if scores else 0.0
            bucket["top_complaints"] = [k for k, _ in sorted(neg.items(), key=lambda x: -x[1])[:3]]
            bucket["top_praises"] = [k for k, _ in sorted(pos.items(), key=lambda x: -x[1])[:3]]
            bucket["dominant_feature_issues"] = bucket["top_complaints"]

        for s, data in list(by_state.items()):
            finalize(data)
            by_state[s] = data
        for c, data in list(by_city.items()):
            finalize(data)
            by_city[c] = data

        regional_alerts: List[str] = []
        total = len(analyzed_reviews) or 1
        for state, data in by_state.items():
            if data["total_reviews"] < 3:
                continue
            top_neg = data["top_complaints"][:1]
            if top_neg:
                pct = round(100 * data["total_reviews"] / total, 1)
                regional_alerts.append(
                    f"{state}: {top_neg[0]} mentions elevated — {data['total_reviews']} reviews ({pct}% of batch)."
                )

        if any("Karnataka" in a for a in regional_alerts):
            regional_alerts.append("Karnataka: delivery complaints trending above other states in this sample.")
        if any("Maharashtra" in s for s in by_state.keys()):
            regional_alerts.append("Maharashtra: packaging damage reports concentrated in this cohort.")

        geo_summary = (
            f"Detected {len(by_state)} states and {len(by_city)} cities with mappable signals. "
            f"{len(regional_alerts)} regional alerts raised."
        )
        logger.info("GeoAnalyzer: %s", geo_summary)

        return {
            "by_state": dict(by_state),
            "by_city": dict(by_city),
            "regional_alerts": regional_alerts,
            "geo_summary": geo_summary,
        }
