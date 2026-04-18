"""
Sentiment, ABSA feature extraction, and sarcasm detection using ModelLoader pipelines.
"""
import logging
from typing import Any, Dict, List

from models.model_loader import ModelLoader
from services.feature_extractor import FEATURE_KEYWORDS, extract_snippet_for_keyword, find_mentioned_features

logger = logging.getLogger(__name__)


class SentimentAnalyzer:
    """Runs HuggingFace models for review understanding."""

    def __init__(self) -> None:
        self._feature_keywords = FEATURE_KEYWORDS

    def _map_sentiment_label(self, label: str) -> str:
        """Map RoBERTa sentiment labels to POSITIVE/NEGATIVE/NEUTRAL."""
        u = (label or "").upper()
        if "LABEL_0" in u or "NEG" in u:
            return "NEGATIVE"
        if "LABEL_1" in u or "NEU" in u:
            return "NEUTRAL"
        if "LABEL_2" in u or "POS" in u:
            return "POSITIVE"
        return "NEUTRAL"

    def _map_absa_label(self, label: str, score: float) -> str:
        """Map ABSA classifier label to coarse sentiment."""
        u = (label or "").lower()
        if "positive" in u or "pos" in u:
            return "POSITIVE"
        if "negative" in u or "neg" in u:
            return "NEGATIVE"
        if score >= 0.55:
            return "POSITIVE"
        if score <= 0.45:
            return "NEGATIVE"
        return "NEUTRAL"

    def analyze_overall_sentiment(self, text: str) -> Dict[str, Any]:
        """Overall sentiment with irony override to SARCASTIC."""
        sentiment_model = ModelLoader.SENTIMENT_MODEL
        irony_model = ModelLoader.IRONY_MODEL
        if sentiment_model is None or irony_model is None:
            return {
                "sentiment": "NEUTRAL",
                "confidence": 0.0,
                "is_sarcastic": False,
                "needs_human_review": True,
            }

        s_out = sentiment_model(text[:512])[0]
        label = s_out.get("label", "")
        conf = float(s_out.get("score", 0.0))
        mapped = self._map_sentiment_label(label)

        i_out = irony_model(text[:512])[0]
        i_label = str(i_out.get("label", "")).lower()
        i_score = float(i_out.get("score", 0.0))
        irony_positive = "irony" in i_label or "label_1" in i_label
        is_sarcastic = irony_positive and i_score > 0.75
        needs_human = is_sarcastic

        final_sent = "SARCASTIC" if is_sarcastic else mapped
        return {
            "sentiment": final_sent,
            "confidence": conf if not is_sarcastic else i_score,
            "is_sarcastic": is_sarcastic,
            "needs_human_review": needs_human,
        }

    def extract_features(self, text: str) -> List[Dict[str, Any]]:
        """Detect aspects and run ABSA per feature."""
        absa = ModelLoader.ABSA_MODEL
        found = find_mentioned_features(text)
        results: List[Dict[str, Any]] = []
        if absa is None:
            return results

        for feature, kws in found:
            snippet = extract_snippet_for_keyword(text, kws[0])
            model_input = f"[CLS] {feature} [SEP] {text[:480]}"
            try:
                out = absa(model_input[:512])[0]
                lab = out.get("label", "")
                sc = float(out.get("score", 0.0))
                sent = self._map_absa_label(lab, sc)
            except Exception as exc:
                logger.warning("ABSA failed for %s: %s", feature, exc)
                sent, sc = "NEUTRAL", 0.0

            results.append(
                {
                    "feature": feature,
                    "sentiment": sent,
                    "confidence": sc,
                    "keywords_found": kws,
                    "relevant_snippet": snippet,
                }
            )
        return results

    def detect_sarcasm(self, text: str) -> Dict[str, Any]:
        """Irony model only."""
        irony_model = ModelLoader.IRONY_MODEL
        if irony_model is None:
            return {"is_sarcastic": False, "sarcasm_score": 0.0, "flag_for_human": False}
        i_out = irony_model(text[:512])[0]
        i_label = str(i_out.get("label", "")).lower()
        i_score = float(i_out.get("score", 0.0))
        irony_positive = "irony" in i_label or "label_1" in i_label
        is_sarc = irony_positive and i_score > 0.75
        return {
            "is_sarcastic": is_sarc,
            "sarcasm_score": i_score,
            "flag_for_human": is_sarc,
        }

    def analyze_review(self, review: Dict[str, Any]) -> Dict[str, Any]:
        """Full single-review pipeline."""
        text = review.get("cleaned_text") or review.get("text") or ""
        overall = self.analyze_overall_sentiment(text)
        features = self.extract_features(text)
        sarcasm = self.detect_sarcasm(text)
        return {
            "review_ref": review,
            "overall_sentiment": overall,
            "features": features,
            "sarcasm": sarcasm,
        }

    def batch_analyze(self, reviews: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Analyze many reviews with progress logs every 10 items."""
        out: List[Dict[str, Any]] = []
        for i, rev in enumerate(reviews):
            if i % 10 == 0:
                logger.info("Sentiment batch progress: %s / %s", i, len(reviews))
            out.append(self.analyze_review(rev))
        logger.info("Sentiment batch complete: %s reviews", len(reviews))
        return out
