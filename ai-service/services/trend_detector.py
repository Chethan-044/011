"""
Trend detection: windows, anomalies, systemic classification, recommendations.
"""
import logging
import statistics
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


def _sentiment_to_score(s: str) -> float:
    u = (s or "").upper()
    if u == "POSITIVE":
        return 1.0
    if u == "NEGATIVE":
        return -1.0
    if u == "SARCASTIC":
        return -0.5
    return 0.0


def _complaint_rate_for_feature(entries: List[Dict[str, Any]], feature: str) -> float:
    """Share of reviews in window with negative ABSA on feature."""
    relevant = [e for e in entries if any(f.get("feature") == feature for f in e.get("features", []))]
    if not relevant:
        return 0.0
    neg = 0
    for e in relevant:
        for f in e.get("features", []):
            if f.get("feature") == feature and f.get("sentiment") == "NEGATIVE":
                neg += 1
                break
    return round(100.0 * neg / len(relevant), 2)


def _rolling_scores(entries: List[Dict[str, Any]], feature: str, window: int = 10) -> List[float]:
    scores: List[float] = []
    for e in entries:
        val = 0.0
        for f in e.get("features", []):
            if f.get("feature") == feature:
                val = _sentiment_to_score(f.get("sentiment"))
                break
        scores.append(val)
    if len(scores) < window:
        return [sum(scores) / len(scores)] if scores else []
    rolled = []
    for i in range(window - 1, len(scores)):
        rolled.append(sum(scores[i - window + 1 : i + 1]) / window)
    return rolled


class TrendDetector:
    """Batch-level trend and anomaly analytics."""

    def detect_trends(
        self,
        analyzed_reviews: List[Dict[str, Any]],
        previous_batches: Optional[List[List[Dict[str, Any]]]] = None,
    ) -> Dict[str, Any]:
        """
        Build emerging issues, improving trends, anomalies, systemic tags, health score.
        """
        logger.info("TrendDetector: analyzing %s reviews", len(analyzed_reviews))
        window_size = 50
        windows: List[List[Dict[str, Any]]] = []
        for i in range(0, len(analyzed_reviews), window_size):
            windows.append(analyzed_reviews[i : i + window_size])

        all_features = set()
        for e in analyzed_reviews:
            for f in e.get("features", []):
                all_features.add(f.get("feature"))

        emerging_issues: List[Dict[str, Any]] = []
        improving_trends: List[Dict[str, Any]] = []

        for feat in sorted(all_features):
            if len(windows) < 2:
                break
            old_w = windows[0]
            new_w = windows[-1]
            old_p = _complaint_rate_for_feature(old_w, feat)
            new_p = _complaint_rate_for_feature(new_w, feat)
            change = round(new_p - old_p, 2)
            if change > 15:
                classification = "SYSTEMIC" if new_p >= 30 else "RECURRING"
                severity = "CRITICAL" if change > 25 and new_p > 30 else "MODERATE"
                emerging_issues.append(
                    {
                        "feature": feat,
                        "old_percentage": old_p,
                        "new_percentage": new_p,
                        "change": change,
                        "severity": severity,
                        "classification": classification,
                        "recommendation": f"Investigate {feat} — complaints rose from {old_p}% to {new_p}%.",
                    }
                )
            elif change < -15:
                improving_trends.append(
                    {
                        "feature": feat,
                        "old_percentage": old_p,
                        "new_percentage": new_p,
                        "change": change,
                        "severity": "MINOR",
                        "classification": "IMPROVING_TREND",
                        "recommendation": f"{feat} complaints eased from {old_p}% to {new_p}%.",
                    }
                )

        anomalies: List[Dict[str, Any]] = []
        for feat in all_features:
            rolled = _rolling_scores(analyzed_reviews, feat, window=15)
            if len(rolled) < 3:
                continue
            mu = statistics.mean(rolled)
            sigma = statistics.pstdev(rolled) or 1e-6
            if rolled[-1] < mu - 2 * sigma:
                anomalies.append(
                    {
                        "feature": feat,
                        "description": f"{feat} sentiment dropped sharply in the latest window",
                        "impact": "high" if rolled[-1] < mu - 3 * sigma else "medium",
                    }
                )

        feature_counts: Dict[str, int] = {}
        for e in analyzed_reviews:
            neg_feats = {f.get("feature") for f in e.get("features", []) if f.get("sentiment") == "NEGATIVE"}
            for f in neg_feats:
                feature_counts[f] = feature_counts.get(f, 0) + 1

        systemic_issues: List[str] = []
        isolated_complaints: List[str] = []
        for feat, cnt in feature_counts.items():
            if cnt >= 10:
                systemic_issues.append(f"{feat}: systemic negative mentions ({cnt} reviews)")
            elif cnt < 3:
                isolated_complaints.append(f"{feat}: isolated ({cnt} reviews)")

        pos = sum(1 for e in analyzed_reviews if e.get("overall_sentiment", {}).get("sentiment") == "POSITIVE")
        neg = sum(1 for e in analyzed_reviews if e.get("overall_sentiment", {}).get("sentiment") == "NEGATIVE")
        neu = sum(1 for e in analyzed_reviews if e.get("overall_sentiment", {}).get("sentiment") == "NEUTRAL")
        sarc = sum(1 for e in analyzed_reviews if e.get("overall_sentiment", {}).get("sentiment") == "SARCASTIC")
        total = max(len(analyzed_reviews), 1)
        health = max(
            0.0,
            min(100.0, 100.0 * (pos + 0.5 * neu) / total - 15 * (neg + sarc) / total),
        )

        cross_batch: List[Dict[str, Any]] = []
        if previous_batches:
            for feat in all_features:
                cur = _complaint_rate_for_feature(analyzed_reviews, feat)
                prev_vals = [_complaint_rate_for_feature(b, feat) for b in previous_batches if b]
                if prev_vals:
                    prev_avg = sum(prev_vals) / len(prev_vals)
                    delta = round(cur - prev_avg, 2)
                    direction = "↑" if delta > 5 else "↓" if delta < -5 else "→"
                    cross_batch.append(
                        {
                            "feature": feat,
                            "current_complaint_pct": cur,
                            "previous_avg_complaint_pct": round(prev_avg, 2),
                            "delta": delta,
                            "direction": direction,
                        }
                    )

        trend_summary_parts = [f"Health score {round(health, 1)}. "]
        for issue in emerging_issues[:3]:
            trend_summary_parts.append(
                f"{issue['feature']} complaints: {issue['old_percentage']}% → {issue['new_percentage']}% "
                f"(↑{issue['change']}%) — {issue['severity']} {issue['classification']}."
            )

        return {
            "emerging_issues": emerging_issues,
            "improving_trends": improving_trends,
            "anomalies": anomalies,
            "systemic_issues": systemic_issues,
            "isolated_complaints": isolated_complaints,
            "overall_health_score": round(health, 2),
            "trend_summary": " ".join(trend_summary_parts),
            "cross_batch": cross_batch,
            "sentiment_counts": {"positive": pos, "negative": neg, "neutral": neu, "sarcastic": sarc},
        }

    def generate_recommendations(self, trend_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Turn trend signals into prioritized actions."""
        recs: List[Dict[str, Any]] = []
        for issue in trend_data.get("emerging_issues", []):
            feat = issue.get("feature", "").lower()
            sev = issue.get("severity", "MODERATE")
            priority = "URGENT" if sev == "CRITICAL" else "HIGH"
            dept = "Logistics"
            if "battery" in feat or "camera" in feat or "display" in feat or "performance" in feat:
                dept = "Product"
            if "packaging" in feat or "delivery" in feat:
                dept = "Logistics"
            if "taste" in feat or "fragrance" in feat:
                dept = "QA"
            if "price" in feat:
                dept = "Marketing"

            if "packaging" in feat and sev == "CRITICAL":
                action = (
                    "Switch packaging supplier immediately. Recent customers reported damage at elevated rates."
                )
            elif "delivery" in feat and sev == "MODERATE":
                action = "Audit courier partner for high-complaint regions. Complaints spiked in the latest window."
            elif "battery" in feat:
                action = "Escalate to product team — recurring battery complaints may indicate a defect cluster."
            elif "taste" in feat:
                action = "Review formulation or batch QC; taste negatives are trending upward."
            else:
                action = issue.get("recommendation") or f"Assign owner for {feat} and track next two upload windows."

            recs.append(
                {
                    "issue": f"{issue.get('feature')} spike",
                    "action": action,
                    "priority": priority,
                    "department": dept,
                    "supporting_data": (
                        f"Complaints moved from {issue.get('old_percentage')}% to "
                        f"{issue.get('new_percentage')}% (Δ {issue.get('change')}%)."
                    ),
                }
            )

        for imp in trend_data.get("improving_trends", []):
            if imp.get("change", 0) < -20:
                recs.append(
                    {
                        "issue": f"{imp.get('feature')} improving",
                        "action": "Highlight improvements in marketing and monitor for regression.",
                        "priority": "LOW",
                        "department": "Marketing",
                        "supporting_data": f"Complaints fell from {imp.get('old_percentage')}% to {imp.get('new_percentage')}%.",
                    }
                )

        return recs
