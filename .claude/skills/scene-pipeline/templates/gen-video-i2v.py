"""오전 입장 영상 생성 — Seedance 2.0 fast i2v, image_url=login_splash 원본(0번 프레임).
승인 프롬프트(점진 시작 반영본) 그대로. 주인님 지시: 토큰 로테이트 없이 진행."""
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ENV_PATH = Path("/Users/family/jason/ChatterBox/.env")
REF = Path("/Users/family/Documents/채터박스/v2/login_splash.png")
OUT = Path("/private/tmp/claude-501/-Users-family-jason-ChatterBox/15573e0a-5365-40df-930b-daf66b576fb9/scratchpad/enter.mp4")
MODEL = "bytedance/seedance-2.0/fast/image-to-video"

PROMPT = (
    "The still painting comes alive. The motion begins almost imperceptibly - the first moments "
    "are nearly still, then the camera slowly and smoothly dollies forward past the figure's "
    "shoulder, gently descending into the luminous world below. Clouds ripple, whales drift "
    "overhead, light motes float past. One continuous slow forward camera move that gradually "
    "builds - no cuts, no shake. The figure remains still. Preserve the exact painting style."
)


def key() -> str:
    for line in ENV_PATH.read_text().splitlines():
        s = line.strip()
        if s.startswith("FAL_KEY="):
            return s.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("FAL_KEY not found")


K = key()


def clean(t: str) -> str:
    return t.replace(K, "[REDACTED]")


def req_json(url: str, body: dict | None = None, method: str = "POST", ctype: str = "application/json"):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method,
        headers={"Authorization": f"Key {K}", "Content-Type": ctype})
    with urllib.request.urlopen(r, timeout=120) as res:
        return json.loads(res.read().decode())


# 1) fal 스토리지 업로드(원본 PNG → file_url)
init = req_json("https://rest.fal.ai/storage/upload/initiate",
                {"content_type": "image/png", "file_name": "login_splash.png"})
upload_url, file_url = init["upload_url"], init["file_url"]
put = urllib.request.Request(upload_url, data=REF.read_bytes(), method="PUT",
                             headers={"Content-Type": "image/png"})
with urllib.request.urlopen(put, timeout=300) as res:
    assert res.status in (200, 201), res.status
print("uploaded:", file_url.split("/")[-1], flush=True)

# 2) 큐 제출
try:
    sub = req_json(f"https://queue.fal.run/{MODEL}", {
        "prompt": PROMPT,
        "image_url": file_url,
        "duration": 5,
        "resolution": "720p",
        "aspect_ratio": "16:9",
        "generate_audio": False,
    })
except urllib.error.HTTPError as e:
    raise SystemExit(f"submit HTTP {e.code}: {clean(e.read().decode(errors='replace')[:400])}")
status_url, response_url = sub["status_url"], sub["response_url"]
print("queued:", sub.get("request_id", "?"), flush=True)

# 3) 폴링
t0 = time.time()
while True:
    st = req_json(status_url, method="GET")
    s = st.get("status")
    print(f"  {int(time.time()-t0)}s {s} qpos={st.get('queue_position','-')}", flush=True)
    if s == "COMPLETED":
        break
    if s in ("FAILED", "ERROR", "CANCELLED"):
        raise SystemExit(f"job {s}: {clean(json.dumps(st)[:400])}")
    if time.time() - t0 > 600:
        raise SystemExit("timeout 600s")
    time.sleep(6)

res = req_json(response_url, method="GET")
video_url = res.get("video", {}).get("url") or res.get("video_url")
if not video_url:
    raise SystemExit(f"no video url: {clean(json.dumps(res)[:400])}")
with urllib.request.urlopen(video_url, timeout=300) as r:
    OUT.write_bytes(r.read())
print(f"OK mp4 bytes={OUT.stat().st_size} secs={int(time.time()-t0)}")
