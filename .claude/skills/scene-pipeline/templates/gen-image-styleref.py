"""lobby-street-day v2: 서양 판타지 + 화풍 복제 — login_splash 원본을 edits 레퍼런스로 입력.
(edits 는 전역 재생성이므로 '같은 화풍의 다른 장면' 생성에 정합 — scene-prompts 함정 기록의 역이용)"""
import base64
import json
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ENV_PATH = Path("/Users/family/jason/ChatterBox/.env")
API_URL = "https://api.openai.com/v1/images/edits"
REF = Path("/Users/family/Documents/채터박스/v2/login_splash.png")
OUT_ROOTS = [
    Path("/private/tmp/claude-501/-Users-family-jason-ChatterBox/15573e0a-5365-40df-930b-daf66b576fb9/scratchpad/v2"),
    Path("/Users/family/Documents/채터박스/v2"),
]
NAME = "lobby_street_day_v2"

PROMPT = (
    "Using the exact same painting style, color palette, lighting and level of painterly detail "
    "as this reference artwork, paint a different scene from the same world: "
    "a western European fantasy shopping street in warm morning light, seen at eye level down the street, "
    "no people, cobblestone road, timber-framed and stone storefronts with round glass windows, "
    "wooden signboards with simple painted symbols and no letters, flower boxes and market stalls "
    "with striped awnings, wrought-iron street lamps and hanging string lights, ivy on the walls, "
    "the sky above is a luminous ocean - whales and schools of small fish swimming among sunlit clouds, "
    "god rays falling between the buildings, drifting dandelion seeds and glowing light motes, "
    "warm gold horizon light and deep blue zenith, wide 16:9 composition"
)


def load_api_key() -> str:
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s.startswith("OPENAI_API_KEY="):
            return s.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def multipart(fields: dict, file_field: str, filename: str, file_bytes: bytes) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    lines: list[bytes] = []
    for k, v in fields.items():
        lines += [f"--{boundary}".encode(), f'Content-Disposition: form-data; name="{k}"'.encode(), b"", str(v).encode()]
    lines += [
        f"--{boundary}".encode(),
        f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"'.encode(),
        b"Content-Type: image/png", b"", file_bytes,
    ]
    lines += [f"--{boundary}--".encode(), b""]
    return b"\r\n".join(lines), boundary


key = load_api_key()
ref_bytes = REF.read_bytes()
last = "?"
for model in ("gpt-image-2", "gpt-image-1"):
    try:
        body, boundary = multipart(
            {"model": model, "prompt": PROMPT, "n": 1, "size": "1536x1024", "quality": "high"},
            "image[]", "login_splash.png", ref_bytes,
        )
        req = urllib.request.Request(API_URL, data=body, method="POST", headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        })
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=480) as r:
            res = json.loads(r.read().decode())
        raw = base64.b64decode(res["data"][0]["b64_json"])
        for root in OUT_ROOTS:
            p = root / f"{NAME}.png"
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(raw)
        print(f"OK {NAME} model={model} bytes={len(raw)} secs={time.time()-t0:.0f}")
        break
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors="replace")[:250]
        last = f"{model}: HTTP {e.code} {msg.replace(key, '[REDACTED]') if key else msg}"
        print(last)
    except Exception as e:
        last = f"{model}: {type(e).__name__} {str(e)[:200]}"
        print(last)
