"""A fake AI used when MOCK_LLM=1. Lets us build/test the UI and the waiting & fallback
behaviour without spending the shared quota. Set MOCK_FAIL_LARGE=1 to simulate the
larger model being unavailable."""
import asyncio
import os
import re


async def mock_reply(task: str, tier: str, messages: list) -> str:
    await asyncio.sleep(0.15 if tier == "compact" else 0.6)
    if tier == "large" and os.getenv("MOCK_FAIL_LARGE") == "1":
        raise asyncio.TimeoutError("mock: large model unavailable")

    system = messages[0]["content"] if messages else ""
    last = messages[-1]["content"] if messages else ""

    if task == "tutor":
        mode = (re.search(r"Mode:\s*(\w+)", system) or [None, "ask"])[1]
        if mode == "ask":
            body = ("You are asking how to approach this. What do you already know about it?\n"
                    "Hint 1: start by naming the quantities involved.")
        elif mode == "hint":
            body = "Hint: look at how the two quantities change together. What stays constant?"
        elif mode == "answer":
            body = ("Step 1: identify the quantities.\nStep 2: apply the rule.\n"
                    "Step 3: check the result.\nCheck question: can you redo it with new numbers?")
        else:
            body = ("Think of it like a recipe: the idea is a rule that turns inputs into outputs.\n"
                    "Check question: can you give your own example?")
        return body + "\nNEXT: try one similar exercise on your own."

    if task == "peer":
        return ("PEER_REACTION: Interesting! I followed the first part, but I got a bit lost in the middle.\n"
                "WHAT_IS_RIGHT: You explained the main idea clearly.\n"
                "WHAT_TO_FIX: You skipped why the rule works; add one example.\n"
                "QUESTION: What would happen if the input doubled?")

    if task == "summary":
        return ("- Main idea: the document introduces the core concept and why it matters.\n"
                "- Key point 1: definitions come first.\n- Key point 2: formulas follow with examples.\n"
                "- To remember: practise with short exercises.")

    if task == "extract":
        return ("DEF: Derivative :: The rate of change of a function at a point.\n"
                "DEF: Function :: A rule that maps each input to one output.\n"
                "FORMULA: f'(x) = lim (f(x+h)-f(x))/h :: Definition of the derivative.\n"
                "FORMULA: (x^n)' = n*x^(n-1) :: Power rule.")

    if task == "quiz":
        q = []
        for i in range(1, 6):
            q.append(f"Q: Mock question {i}: which option is correct?\nA) Wrong idea\nB) The right idea\n"
                     f"C) Another wrong idea\nD) None of these\nANSWER: B\nWHY: Option B matches the course material.")
        return "\n\n".join(q)

    return "OK"
