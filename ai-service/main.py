"""
ReviewSense FastAPI AI microservice entrypoint.
"""
import logging
import time
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from models.model_loader import ModelLoader
from services.bot_detector import BotDetectorService
from services.geo_analyzer import GeoAnalyzer
from services.preprocessor import PreprocessorService
from services.report_generator import ReportGeneratorService
from services.sentiment_analyzer import SentimentAnalyzer
from services.trend_detector import TrendDetector

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("reviewsense.ai")

START_MONO = time.monotonic()
preprocessor = PreprocessorService()
bot_detector = BotDetectorService()
sentiment_analyzer = SentimentAnalyzer()
trend_detector = TrendDetector()
geo_analyzer = GeoAnalyzer()
report_generator = ReportGeneratorService()

app = FastAPI(title="ReviewSense AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event() -> None:
    """Load HuggingFace pipelines once."""
    print("[Startup] Loading ReviewSense models...")
    ModelLoader.load_all()
    print("ReviewSense AI Service Ready")


class ReviewInput(BaseModel):
    text: Optional[str] = None
    originalText: Optional[str] = None
    rating: Optional[float] = None
    reviewDate: Optional[str] = None
    reviewerLocation: Optional[str] = None


class BatchAnalyzeBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    reviews: List[Dict[str, Any]]
    product_name: str = Field(default="", validation_alias=AliasChoices("product_name", "productName"))
    category: str = ""


class SingleAnalyzeBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    text: str
    product_name: str = Field(default="", validation_alias=AliasChoices("product_name", "productName"))


class PreprocessBody(BaseModel):
    reviews: List[Dict[str, Any]]


class TrendCompareBody(BaseModel):
    batch1: List[Dict[str, Any]]
    batch2: List[Dict[str, Any]]


class ReportBody(BaseModel):
    analysis_result: Dict[str, Any]
    format: str = "pdf"


def _normalize_review_dict(r: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure canonical keys for downstream services."""
    text = r.get("text") or r.get("originalText") or ""
    rid = r.get("reviewId") or r.get("id") or ""
    return {
        **r,
        "text": text,
        "originalText": r.get("originalText") or text,
        "reviewId": rid,
    }


def _merge_feature_analysis(analyzed_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Aggregate feature counts for reporting."""
    buckets: Dict[str, Dict[str, Any]] = {}
    for row in analyzed_rows:
        for feat in row.get("features", []):
            name = feat.get("feature")
            if not name:
                continue
            if name not in buckets:
                buckets[name] = {
                    "feature": name,
                    "positiveCount": 0,
                    "negativeCount": 0,
                    "neutralCount": 0,
                    "scores": [],
                }
            sent = feat.get("sentiment")
            if sent == "POSITIVE":
                buckets[name]["positiveCount"] += 1
            elif sent == "NEGATIVE":
                buckets[name]["negativeCount"] += 1
            else:
                buckets[name]["neutralCount"] += 1
            buckets[name]["scores"].append(float(feat.get("confidence") or 0))
    out = []
    for data in buckets.values():
        scores = data.pop("scores", [])
        avg_conf = sum(scores) / len(scores) if scores else 0.0
        out.append(
            {
                **data,
                "avgConfidence": round(avg_conf, 3),
                "trend": "stable",
            }
        )
    return out


def _sentiment_breakdown(rows: List[Dict[str, Any]]) -> Dict[str, int]:
    """Count overall sentiment labels."""
    summary = {"positive": 0, "negative": 0, "neutral": 0, "sarcastic": 0}
    for row in rows:
        label = (row.get("overall_sentiment") or {}).get("sentiment", "NEUTRAL")
        if label == "POSITIVE":
            summary["positive"] += 1
        elif label == "NEGATIVE":
            summary["negative"] += 1
        elif label == "SARCASTIC":
            summary["sarcastic"] += 1
        else:
            summary["neutral"] += 1
    return summary


@app.get("/api/health")
def health() -> Dict[str, Any]:
    """Service heartbeat and model readiness."""
    status = ModelLoader.get_status()
    uptime = round(time.monotonic() - START_MONO, 2)
    payload = {
        "status": "ok" if status["is_loaded"] else "degraded",
        "models_loaded": status["is_loaded"],
        "model_names": status["model_names"],
        "uptime": uptime,
    }
    return {"success": True, "data": payload, "message": "AI service heartbeat"}


@app.post("/api/preprocess")
def preprocess(body: PreprocessBody) -> Dict[str, Any]:
    """Clean and translate reviews only."""
    try:
        logger.info("Preprocess: %s reviews", len(body.reviews))
        cleaned = preprocessor.batch_clean([_normalize_review_dict(r) for r in body.reviews])
        return {"success": True, "data": {"reviews": cleaned}, "message": "Preprocessing complete"}
    except Exception as exc:
        logger.exception("Preprocess failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/analyze/single")
def analyze_single(body: SingleAnalyzeBody) -> Dict[str, Any]:
    """Analyze a single snippet end-to-end."""
    try:
        logger.info("Single analyze for product=%s", body.product_name)
        base = _normalize_review_dict({"text": body.text, "productName": body.product_name})
        cleaned = preprocessor.clean_text(base["text"])
        merged = {**base, **cleaned}
        bot_rows = bot_detector.detect_bots([merged])
        row = bot_rows[0]
        if row.get("is_bot"):
            payload = {
                "review": row,
                "analysis": {
                    "overall_sentiment": {
                        "sentiment": "NEUTRAL",
                        "confidence": 0.0,
                        "is_sarcastic": False,
                        "needs_human_review": True,
                    },
                    "features": [],
                    "sarcasm": {"is_sarcastic": False, "sarcasm_score": 0.0, "flag_for_human": False},
                },
                "skipped_deep_models": True,
            }
            return {"success": True, "data": payload, "message": "Analyzed with bot prioritization"}

        analysis = sentiment_analyzer.analyze_review(row)
        geo = geo_analyzer.extract_location(row.get("cleaned_text") or "", row)
        row["geoLocation"] = {"city": geo.get("city"), "state": geo.get("state")}
        payload = {"review": row, "analysis": analysis, "geo": geo}
        return {"success": True, "data": payload, "message": "Analysis complete"}
    except Exception as exc:
        logger.exception("Single analyze failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/analyze/batch")
def analyze_batch(body: BatchAnalyzeBody) -> Dict[str, Any]:
    """Full batch pipeline for dashboard uploads."""
    t0 = time.time()
    try:
        logger.info("Batch analyze start: %s reviews", len(body.reviews))
        normalized = [_normalize_review_dict(r) for r in body.reviews]
        logger.info("Step preprocess")
        preprocessed = preprocessor.batch_clean(normalized)
        logger.info("Step bot detection")
        bot_flagged = bot_detector.detect_bots(preprocessed)
        bot_summary = bot_detector.get_bot_summary(bot_flagged)

        clean_rows = [r for r in bot_flagged if not r.get("is_bot")]
        logger.info("Step sentiment on %s clean reviews", len(clean_rows))
        analyzed_clean = sentiment_analyzer.batch_analyze(clean_rows)

        merged_analyzed: List[Dict[str, Any]] = []
        clean_iter = iter(analyzed_clean)
        for row in bot_flagged:
            if row.get("is_bot"):
                merged_analyzed.append(
                    {
                        "review_ref": row,
                        "overall_sentiment": {
                            "sentiment": "NEUTRAL",
                            "confidence": 0.0,
                            "is_sarcastic": False,
                            "needs_human_review": False,
                        },
                        "features": [],
                        "sarcasm": {"is_sarcastic": False, "sarcasm_score": 0.0, "flag_for_human": False},
                    }
                )
            else:
                item = next(clean_iter)
                merged_analyzed.append(
                    {
                        "review_ref": item["review_ref"],
                        "overall_sentiment": item["overall_sentiment"],
                        "features": item["features"],
                        "sarcasm": item["sarcasm"],
                    }
                )

        for entry in merged_analyzed:
            ref = entry["review_ref"]
            geo = geo_analyzer.extract_location(ref.get("cleaned_text") or "", ref)
            ref["geoLocation"] = {"city": geo.get("city"), "state": geo.get("state")}

        trend_source = [m for m in merged_analyzed if not m["review_ref"].get("is_bot")]
        logger.info("Step trend detection")
        trends = trend_detector.detect_trends(trend_source)
        recommendations = trend_detector.generate_recommendations(trends)
        logger.info("Step geo aggregation")
        geo_insights = geo_analyzer.aggregate_geo_insights(merged_analyzed)

        reviews_out: List[Dict[str, Any]] = []
        for entry in merged_analyzed:
            ref = entry["review_ref"]
            rid = ref.get("reviewId") or f"rev-{len(reviews_out)+1}"
            reviews_out.append(
                {
                    "reviewId": rid,
                    "originalText": ref.get("original_text") or ref.get("originalText"),
                    "cleanedText": ref.get("cleaned_text"),
                    "detectedLanguage": ref.get("detected_language"),
                    "wasTranslated": ref.get("was_translated", False),
                    "rating": ref.get("rating"),
                    "reviewDate": ref.get("reviewDate"),
                    "reviewerLocation": ref.get("reviewerLocation"),
                    "isBot": ref.get("is_bot", False),
                    "botReasons": ref.get("bot_reasons", []),
                    "botConfidence": ref.get("bot_confidence", 0),
                    "botSeverity": ref.get("bot_severity", "clean"),
                    "overallSentiment": entry["overall_sentiment"]["sentiment"],
                    "sentimentConfidence": entry["overall_sentiment"]["confidence"],
                    "isSarcastic": entry["overall_sentiment"]["is_sarcastic"],
                    "needsHumanReview": entry["overall_sentiment"]["needs_human_review"],
                    "featureSentiments": [
                        {
                            "feature": f.get("feature"),
                            "sentiment": f.get("sentiment"),
                            "confidence": f.get("confidence"),
                            "keywords": f.get("keywords_found", []),
                            "snippet": f.get("relevant_snippet"),
                        }
                        for f in entry.get("features", [])
                    ],
                    "geoLocation": ref.get("geoLocation", {}),
                }
            )

        feature_analysis = _merge_feature_analysis(trend_source)
        sentiment_breakdown = _sentiment_breakdown(merged_analyzed)
        processing_time = round(time.time() - t0, 3)

        analysis_result = {
            "product_name": body.product_name,
            "category": body.category,
            "summary": {
                "total_reviews": len(body.reviews),
                "clean_reviews": bot_summary["clean_reviews"],
                "bot_flagged": bot_summary["bot_flagged"],
                "overall_health_score": trends["overall_health_score"],
                "overall_sentiment_breakdown": sentiment_breakdown,
                "processing_time_seconds": processing_time,
            },
            "bot_summary": bot_summary,
            "reviews": reviews_out,
            "feature_analysis": feature_analysis,
            "trend_report": {
                "emergingIssues": trends["emerging_issues"],
                "improvingTrends": trends["improving_trends"],
                "anomalies": trends["anomalies"],
                "systemicIssues": trends["systemic_issues"],
                "overallHealthScore": trends["overall_health_score"],
                "trendSummary": trends["trend_summary"],
            },
            "recommendations": recommendations,
            "geo_insights": geo_insights,
        }

        logger.info("Batch analyze complete in %ss", processing_time)
        return {"success": True, "data": analysis_result, "message": "Batch analysis complete"}
    except Exception as exc:
        logger.exception("Batch analyze failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/trends/compare")
def compare_trends(body: TrendCompareBody) -> Dict[str, Any]:
    """Compare two analyzed batches."""
    try:
        logger.info("Trend compare: batches %s vs %s", len(body.batch1), len(body.batch2))

        def complaint_snapshot(batch: List[Dict[str, Any]]) -> Dict[str, float]:
            feats: Dict[str, List[bool]] = {}
            for row in batch:
                for f in row.get("features", []):
                    name = f.get("feature")
                    feats.setdefault(name, []).append(f.get("sentiment") == "NEGATIVE")
            snap = {}
            for name, flags in feats.items():
                snap[name] = round(100.0 * sum(flags) / len(flags), 2) if flags else 0.0
            return snap

        a = complaint_snapshot(body.batch1)
        b = complaint_snapshot(body.batch2)
        keys = sorted(set(a.keys()) | set(b.keys()))
        deltas = []
        for k in keys:
            deltas.append(
                {
                    "feature": k,
                    "batch1_complaint_pct": a.get(k, 0.0),
                    "batch2_complaint_pct": b.get(k, 0.0),
                    "delta": round(b.get(k, 0.0) - a.get(k, 0.0), 2),
                }
            )
        return {"success": True, "data": {"comparison": deltas}, "message": "Comparison ready"}
    except Exception as exc:
        logger.exception("Trend compare failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/report/generate")
def generate_report(body: ReportBody) -> Response:
    """Return downloadable PDF or CSV bytes."""
    try:
        logger.info("Generating report format=%s", body.format)
        buffer = report_generator.generate(body.analysis_result, body.format)
        media = "application/pdf" if body.format.lower() == "pdf" else "text/csv"
        ext = "pdf" if body.format.lower() == "pdf" else "csv"
        headers = {"Content-Disposition": f'attachment; filename="reviewsense-report.{ext}"'}
        return Response(content=buffer, media_type=media, headers=headers)
    except Exception as exc:
        logger.exception("Report generation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
