"""
PDF and CSV report generation from analysis payloads.
"""
import csv
import io
import logging
from typing import Any, Dict

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

logger = logging.getLogger(__name__)


class ReportGeneratorService:
    """Build downloadable artifacts for judges and operators."""

    def generate(self, analysis_result: Dict[str, Any], fmt: str) -> bytes:
        """Return file bytes for pdf or csv."""
        fmt = (fmt or "pdf").lower()
        logger.info("ReportGenerator: building %s report", fmt)
        if fmt == "csv":
            return self._csv_bytes(analysis_result)
        return self._pdf_bytes(analysis_result)

    def _csv_bytes(self, data: Dict[str, Any]) -> bytes:
        """Flatten key summary fields to CSV."""
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["ReviewSense Export"])
        summary = data.get("summary") or {}
        writer.writerow(["Total Reviews", summary.get("total_reviews", "")])
        writer.writerow(["Clean Reviews", summary.get("clean_reviews", "")])
        writer.writerow(["Bot Flagged", summary.get("bot_flagged", "")])
        writer.writerow(["Health Score", summary.get("overall_health_score", "")])
        writer.writerow([])
        writer.writerow(["Feature", "Positive", "Negative", "Neutral"])
        for row in data.get("feature_analysis", []):
            writer.writerow(
                [
                    row.get("feature"),
                    row.get("positiveCount"),
                    row.get("negativeCount"),
                    row.get("neutralCount"),
                ]
            )
        writer.writerow([])
        writer.writerow(["Recommendation", "Priority", "Department", "Action", "Supporting data"])
        for rec in data.get("recommendations", []):
            writer.writerow(
                [
                    rec.get("issue"),
                    rec.get("priority"),
                    rec.get("department"),
                    rec.get("action"),
                    rec.get("supporting_data") or rec.get("supportingData"),
                ]
            )
        return buffer.getvalue().encode("utf-8")

    def _pdf_bytes(self, data: Dict[str, Any]) -> bytes:
        """Simple PDF summary using ReportLab canvas."""
        packet = io.BytesIO()
        pdf = canvas.Canvas(packet, pagesize=letter)
        width, height = letter
        y = height - 72
        pdf.setTitle("ReviewSense Analysis Report")
        pdf.setFont("Helvetica-Bold", 16)
        pdf.drawString(72, y, "ReviewSense — Analysis Report")
        y -= 28
        pdf.setFont("Helvetica", 11)
        summary = data.get("summary") or {}
        lines = [
            f"Product: {data.get('product_name', 'N/A')}",
            f"Category: {data.get('category', 'N/A')}",
            f"Total Reviews: {summary.get('total_reviews', '')}",
            f"Clean Reviews: {summary.get('clean_reviews', '')}",
            f"Bot Flagged: {summary.get('bot_flagged', '')}",
            f"Health Score: {summary.get('overall_health_score', '')}",
        ]
        for line in lines:
            pdf.drawString(72, y, line[:120])
            y -= 16
            if y < 120:
                pdf.showPage()
                y = height - 72
        y -= 10
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(72, y, "Top Recommendations")
        y -= 18
        pdf.setFont("Helvetica", 10)
        for rec in (data.get("recommendations") or [])[:6]:
            text = f"- [{rec.get('priority')}] {rec.get('action', '')}"
            pdf.drawString(82, y, text[:110])
            y -= 14
            if y < 100:
                pdf.showPage()
                y = height - 72
        pdf.showPage()
        pdf.save()
        pdf_bytes = packet.getvalue()
        packet.close()
        return pdf_bytes
