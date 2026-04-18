"""
Loads HuggingFace models once at startup and exposes singleton accessors.
All models run on CPU (device=-1).
"""
from typing import Any, Dict, Optional

from transformers import pipeline


class ModelLoader:
    """
    Singleton-style loader for sentiment, ABSA, irony, and translation pipelines.
    """

    is_loaded: bool = False
    SENTIMENT_MODEL: Optional[Any] = None
    ABSA_MODEL: Optional[Any] = None
    IRONY_MODEL: Optional[Any] = None
    TRANSLATION_MODEL: Optional[Any] = None

    SENTIMENT_MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment-latest"
    ABSA_MODEL_NAME = "yangheng/deberta-v3-base-absa-v1.1"
    IRONY_MODEL_NAME = "cardiffnlp/twitter-roberta-base-irony"
    TRANSLATION_MODEL_NAME = "Helsinki-NLP/opus-mt-hi-en"

    @classmethod
    def load_all(cls) -> None:
        """Initialize all pipelines on CPU."""
        print("[ModelLoader] Loading model SENTIMENT_MODEL...")
        cls.SENTIMENT_MODEL = pipeline(
            "sentiment-analysis",
            model=cls.SENTIMENT_MODEL_NAME,
            device=-1,
        )

        print("[ModelLoader] Loading model ABSA_MODEL...")
        cls.ABSA_MODEL = pipeline(
            "text-classification",
            model=cls.ABSA_MODEL_NAME,
            device=-1,
        )

        print("[ModelLoader] Loading model IRONY_MODEL...")
        cls.IRONY_MODEL = pipeline(
            "text-classification",
            model=cls.IRONY_MODEL_NAME,
            device=-1,
        )

        print("[ModelLoader] Loading model TRANSLATION_MODEL...")
        cls.TRANSLATION_MODEL = pipeline(
            "translation",
            model=cls.TRANSLATION_MODEL_NAME,
            device=-1,
        )

        cls.is_loaded = True
        print("[ModelLoader] All models loaded successfully.")

    @classmethod
    def get_status(cls) -> Dict[str, Any]:
        """Return readiness flags for each model."""
        return {
            "is_loaded": cls.is_loaded,
            "sentiment_ready": cls.SENTIMENT_MODEL is not None,
            "absa_ready": cls.ABSA_MODEL is not None,
            "irony_ready": cls.IRONY_MODEL is not None,
            "translation_ready": cls.TRANSLATION_MODEL is not None,
            "model_names": {
                "sentiment": cls.SENTIMENT_MODEL_NAME,
                "absa": cls.ABSA_MODEL_NAME,
                "irony": cls.IRONY_MODEL_NAME,
                "translation": cls.TRANSLATION_MODEL_NAME,
            },
        }
