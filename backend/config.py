"""Central configuration. Every secret and URL comes from the environment (.env).

Nothing here is hard-coded on purpose: the challenge rules require the platform URL
and the key to be configurable and never committed.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # finds .env in backend/ or in the project root


def _model(name: str, default: str) -> str:
    # strip() and rstrip(".") protect against the typo we hit earlier ("llama3.1-8b..")
    value = os.getenv(name, "").strip().rstrip(".")
    return value or default


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "").strip() or default)
    except ValueError:
        return default


BASE_URL = os.getenv("LLM_BASE_URL", "").strip()
API_KEY = os.getenv("LLM_API_KEY", "").strip()

# Compact = fast, short, well-defined tasks. Large = reasoning / synthesis / polished writing.
MODEL_COMPACT = _model("MODEL_COMPACT", "qwen2.5-3b")
MODEL_LARGE = _model("MODEL_LARGE", "llama3.1-8b")

# MOCK_LLM=1 runs the whole app with a simulated AI (no key needed): UI work, demos of
# the waiting/fallback states, tests.
MOCK_LLM = os.getenv("MOCK_LLM", "0").strip() == "1"

# Platform limit is 20 requests/minute and 2 concurrent; keep a safety margin.
RATE_PER_MINUTE = _int("RATE_LIMIT_PER_MINUTE", 18)
MAX_CONCURRENT = _int("MAX_CONCURRENT", 2)

COMPACT_TIMEOUT_S = _int("COMPACT_TIMEOUT_S", 45)
LARGE_TIMEOUT_S = _int("LARGE_TIMEOUT_S", 80)

MAX_UPLOAD_MB = _int("MAX_UPLOAD_MB", 10)

DATA_DIR = Path(os.getenv("DATA_DIR", "") or Path(__file__).parent / "data")
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = str(DATA_DIR / "ednova.db")

SUPPORTED_LANGS = ("en", "fr", "ar", "darija")
