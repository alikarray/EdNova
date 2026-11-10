"""Document handling: text extraction, chunking and a tiny keyword retriever.

The retriever is the "document-retrieval capability" from the challenge, kept dependency-free:
it scores chunks with TF-IDF so the model only receives the few relevant passages (better
relevance, fewer tokens, lighter load on the shared service).
"""
import io
import math
import re

MAX_PAGES = 80
MAX_CHARS = 60000


class DocError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def extract_text(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader
        try:
            reader = PdfReader(io.BytesIO(data))
            pages = []
            for p in reader.pages[:MAX_PAGES]:
                try:
                    pages.append(p.extract_text() or "")
                except Exception:  # noqa: BLE001 - one bad page must not kill the upload
                    pages.append("")
        except Exception as e:  # noqa: BLE001
            raise DocError("bad_pdf", f"Could not read this PDF ({type(e).__name__}).") from e
        text = "\n\n".join(pages)
    elif name.endswith((".txt", ".md")):
        text = data.decode("utf-8", errors="replace")
    else:
        raise DocError("unsupported", "Please upload a PDF, .txt or .md file.")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) < 50:
        raise DocError("no_text", "No readable text found. This looks like a scanned PDF "
                                  "(OCR is not enabled yet).")
    return text[:MAX_CHARS]


def chunk_text(text: str, size: int = 900) -> list:
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks, cur = [], ""
    for p in paras:
        while len(p) > size * 1.5:  # PDFs often have one giant paragraph
            cut = p.rfind(" ", 0, size)
            cut = cut if cut > 200 else size
            piece, p = p[:cut], p[cut:].lstrip()
            if cur:
                chunks.append(cur)
                cur = ""
            chunks.append(piece)
        if len(cur) + len(p) + 2 <= size:
            cur = (cur + "\n\n" + p).strip()
        else:
            if cur:
                chunks.append(cur)
            cur = p
    if cur:
        chunks.append(cur)
    return chunks


_STOP = set("the and for with that this from are was were you your have has not but can will "
            "les des une est dans pour que qui sur par pas aux ses son sont plus the of to in is "
            "في من على إلى عن هذا هذه ما هو هي".split())


def _tokens(s: str) -> list:
    return [t for t in re.findall(r"\w+", s.lower()) if len(t) > 2 and t not in _STOP]


def search(chunks: list, query: str, k: int = 3) -> list:
    q = _tokens(query)
    if not q or not chunks:
        return []
    toks = [_tokens(c) for c in chunks]
    n = len(chunks)
    df = {}
    for ts in toks:
        for t in set(ts):
            df[t] = df.get(t, 0) + 1
    scored = []
    for i, ts in enumerate(toks):
        score = 0.0
        for t in set(q):
            tf = ts.count(t)
            if tf:
                score += (1 + math.log(tf)) * (math.log((n + 1) / (df.get(t, 0) + 0.5)) + 1)
        if score > 0:
            scored.append((score, i))
    scored.sort(key=lambda x: -x[0])
    return [chunks[i] for _, i in scored[:k]]


def windows(text: str, n: int = 3, size: int = 3000) -> list:
    """Evenly spaced excerpts so a long document is covered with few model calls."""
    if len(text) <= size:
        return [text]
    if len(text) <= n * size:
        count = -(-len(text) // size)
        return [text[i * size:(i + 1) * size] for i in range(count)]
    step = (len(text) - size) / (n - 1)
    return [text[int(i * step): int(i * step) + size] for i in range(n)]
