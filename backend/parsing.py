"""Small models are bad at strict JSON, so every prompt asks for simple line formats
(DEF: a :: b, Q:/A)/ANSWER:, section markers) and we parse them tolerantly here."""
import re


def split_next(text: str):
    """Separate the 'NEXT: ...' suggestion line from the reply."""
    m = re.search(r"^[\s*_-]*NEXT[\s*_]*:\s*(.+)$", text, re.I | re.M)
    if not m:
        return text.strip(), None
    reply = (text[:m.start()] + text[m.end():]).strip()
    return reply, m.group(1).strip().strip("*_ ")


def parse_defs_formulas(text: str) -> dict:
    defs, formulas = [], []
    seen_d, seen_f = set(), set()
    for line in text.splitlines():
        m = re.match(r"^[\W\d_]*DEF(?:INITION)?\s*:\s*(.+?)\s*::\s*(.+?)\s*$", line, re.I)
        if m:
            term, definition = m.group(1).strip("*_ "), m.group(2).strip("*_ ")
            if term.lower() not in seen_d and definition:
                seen_d.add(term.lower())
                defs.append({"term": term, "definition": definition})
            continue
        m = re.match(r"^[\W\d_]*FORMULA\s*:\s*(.+?)\s*::\s*(.+?)\s*$", line, re.I)
        if m:
            expr, meaning = m.group(1).strip("*_ "), m.group(2).strip("*_ ")
            if expr.lower() not in seen_f and meaning:
                seen_f.add(expr.lower())
                formulas.append({"expression": expr, "meaning": meaning})
    return {"definitions": defs, "formulas": formulas}


def parse_quiz(text: str) -> list:
    blocks = re.split(r"(?im)^\W*Q\d*\s*[:.)]\s*", text)[1:]
    quiz = []
    for b in blocks:
        lines = [ln.strip() for ln in b.strip().splitlines() if ln.strip()]
        if not lines:
            continue
        question = lines[0].strip("*_ ")
        options, answer, why = {}, None, ""
        for ln in lines[1:]:
            mo = re.match(r"^\W*([A-D])\s*[).:]\s*(.+)$", ln)
            ma = re.match(r"(?i)^\W*ANSWER\s*:\s*\W*([A-D])", ln)
            mw = re.match(r"(?i)^\W*(?:WHY|EXPLANATION)\s*:\s*(.+)$", ln)
            if ma:
                answer = ma.group(1).upper()
            elif mw:
                why = mw.group(1).strip("*_ ")
            elif mo and mo.group(1) not in options:
                options[mo.group(1)] = mo.group(2).strip("*_ ")
        letters = [c for c in "ABCD" if c in options]
        if len(letters) == 4 and answer in options:
            quiz.append({"question": question, "options": [options[c] for c in letters],
                         "answer_index": letters.index(answer), "explanation": why})
    return quiz


PEER_KEYS = ["PEER_REACTION", "WHAT_IS_RIGHT", "WHAT_TO_FIX", "QUESTION"]


def parse_peer(text: str) -> dict:
    parts = re.split(r"(?im)^[\W_]*(%s)[\W_]*:\s*" % "|".join(PEER_KEYS), text)
    out = {}
    for i in range(1, len(parts) - 1, 2):
        out[parts[i].upper()] = parts[i + 1].strip()
    return out


_CONFUSION = re.compile(
    r"(don'?t|do not|doesn'?t|still (?:not )?|can'?t)\s*(?:really\s*)?(?:understand|get it|follow)|confus|"
    r"i'?m (?:lost|stuck)|makes no sense|what do you mean|"
    r"je ne comprends pas|je comprends pas|pas compris|j'?ai pas compris|je suis perdu|je suis bloqu|"
    r"ما فهمت|مافهمت|لم أفهم|لا أفهم|مش فاهم|مفهمتش|ما نفهمش|منفهمش|غير واضح|ضايع|"
    r"ma fhemtech|mafhemtech|ma fhemt|manfhemch|ma nfhemch",
    re.I)


def detect_confusion(text: str) -> bool:
    return bool(_CONFUSION.search(text or ""))
