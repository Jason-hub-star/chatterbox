"""입장 영상 Topaz 업스케일: 2x(1440p) + 48fps 보간. 예상 비용 ~$0.40(5s, >1080p=\$0.08/s, 48fps는 기본요금)."""
import json, time, urllib.error, urllib.request
from pathlib import Path

ENV_PATH = Path("/Users/family/jason/ChatterBox/.env")
SRC = Path("/private/tmp/claude-501/-Users-family-jason-ChatterBox/15573e0a-5365-40df-930b-daf66b576fb9/scratchpad/enter.mp4")
OUT = Path("/private/tmp/claude-501/-Users-family-jason-ChatterBox/15573e0a-5365-40df-930b-daf66b576fb9/scratchpad/enter_1440.mp4")
MODEL = "fal-ai/topaz/upscale/video"

def key():
    for line in ENV_PATH.read_text().splitlines():
        s = line.strip()
        if s.startswith("FAL_KEY="):
            return s.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no key")

K = key()
def clean(t): return t.replace(K, "[REDACTED]")

def rj(url, body=None, method="POST", ctype="application/json"):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method,
        headers={"Authorization": f"Key {K}", "Content-Type": ctype})
    with urllib.request.urlopen(r, timeout=180) as res:
        return json.loads(res.read().decode())

init = rj("https://rest.fal.ai/storage/upload/initiate", {"content_type": "video/mp4", "file_name": "enter.mp4"})
put = urllib.request.Request(init["upload_url"], data=SRC.read_bytes(), method="PUT", headers={"Content-Type": "video/mp4"})
with urllib.request.urlopen(put, timeout=600) as res:
    assert res.status in (200, 201)
print("uploaded", flush=True)

try:
    sub = rj(f"https://queue.fal.run/{MODEL}", {"video_url": init["file_url"], "upscale_factor": 2, "target_fps": 48})
except urllib.error.HTTPError as e:
    raise SystemExit(f"submit HTTP {e.code}: {clean(e.read().decode(errors='replace')[:400])}")
print("queued:", sub.get("request_id", "?"), flush=True)

t0 = time.time()
while True:
    st = rj(sub["status_url"], method="GET")
    s = st.get("status")
    print(f"  {int(time.time()-t0)}s {s}", flush=True)
    if s == "COMPLETED": break
    if s in ("FAILED", "ERROR", "CANCELLED"): raise SystemExit(f"job {s}: {clean(json.dumps(st)[:400])}")
    if time.time() - t0 > 900: raise SystemExit("timeout")
    time.sleep(7)

res = rj(sub["response_url"], method="GET")
url = res.get("video", {}).get("url") or res.get("video_url")
if not url: raise SystemExit(f"no url: {clean(json.dumps(res)[:400])}")
with urllib.request.urlopen(url, timeout=600) as r:
    OUT.write_bytes(r.read())
print(f"OK mp4 bytes={OUT.stat().st_size} secs={int(time.time()-t0)}")
