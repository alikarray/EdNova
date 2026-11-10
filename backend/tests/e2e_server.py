"""Starts the real app (main.py) with the simulated AI, using the local FastAPI stand-in
when the real FastAPI is not installed. Used only for browser tests in the build sandbox.

    python tests/e2e_server.py 8765
"""
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
try:
    import fastapi  # noqa: F401
except ModuleNotFoundError:
    sys.path.insert(0, os.path.join(HERE, "shim"))

os.environ["MOCK_LLM"] = "1"
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="ednova-e2e-"))

import uvicorn  # noqa: E402

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    uvicorn.run("main:app", host="127.0.0.1", port=port, log_level="warning")
