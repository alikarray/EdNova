import os, time
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
client = OpenAI(base_url=os.environ["LLM_BASE_URL"], api_key=os.environ["LLM_API_KEY"])

print("Models:")
for m in client.models.list().data:
    print(" -", m.id)

for name in (os.getenv("MODEL_COMPACT"), os.getenv("MODEL_LARGE")):
    if not name:
        continue
    t = time.time()
    r = client.chat.completions.create(
        model=name,
        messages=[{"role": "user", "content": "Explique en une phrase simple ce qu'est une dérivée."}],
    )
    print(f"\n{name}: {time.time() - t:.1f}s")
    print(r.choices[0].message.content)