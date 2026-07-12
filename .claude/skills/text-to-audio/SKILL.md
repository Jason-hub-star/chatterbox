---
name: text-to-audio
description: ChatterBox 음원 자산 파이프라인 — BGM/앰비언트/SFX 를 프롬프트로 생성(fal Stable Audio 2.5 · CassetteAI SFX) → 주인님 청취 게이트 → loudnorm+AAC → public/sounds/ 안착. "BGM 만들어", "음원 생성", "효과음 뽑아", "앰비언트", "사운드 추가" 요청 시. 2026-07-13 G6 BGM 3곡 세션에서 밟은 함정을 고정.
---

# text-to-audio

음원 자산은 **파일 교체가 곧 업그레이드**인 구조로 다룬다 — 코드는 URL 만 알고, 품질·무드는 전부 이 파이프라인 안에서 끝낸다. 유일한 품질 게이트는 주인님 귀(청취 판정)다.

## 모델 카드 (2026-07-13 실측 단가 — 착수 전 재확인)

| 용도 | 모델 | 단가 | 비고 |
|---|---|---|---|
| BGM/음악/앰비언트 | fal `fal-ai/stable-audio-25/text-to-audio` | **$0.20/발** | 최대 190s · 생성 ~4s · 응답 `{audio:{url}, seed}` — seed 보존하면 같은 결 변주 가능 |
| SFX(팝·차임·효과음) | fal `cassetteai/sound-effects-generator` | **$0.01/발** | 사실상 공짜 — 리테이크 부담 없음 |
| (조건부) BGM 최저가 | Gemini Lyria 3 (`lyria-3-clip-preview` 30s / `lyria-3-pro-preview` 완곡) | $0.04~0.08/요청 | `POST generativelanguage.googleapis.com/v1beta/interactions` · **무료 티어 한도 0(429 실측)** — GEMINI_API_KEY 에 결제 활성화 시에만 경로 존재 |

- stable-audio-25 실측 파라미터: `prompt`(필수) · `seconds_total`(1~190) · `num_inference_steps`(4~8, 8 권장) · `guidance_scale`(1~25) · `seed`.
- "Gemini Flash 무료" 는 텍스트·이미지 전용 — 오디오 파형 출력 경로가 아예 없다(무료 오디오 표기는 Live 대화 음성뿐).

## 배포 자산 규격 (ChatterBox)

- 포맷 **AAC `.m4a` 128k** — opus/ogg 는 Safari HTMLAudioElement 비호환. WAV 21MB → ~1.9MB.
- **순환 플레이리스트 세트는 전 트랙 `loudnorm=I=-16:TP=-1.5:LRA=11`** — 곡 전환 시 레벨 튐 방지(개별 감은 앱의 bgmVolume 이 담당).
- 위치 `public/sounds/` · 파일명은 무드 서술형(`bgm-village-dusk.m4a`) · 커밋은 해당 기능 커밋에 동승.

## 함정 (실측 — 재발견 금지)

1. **키 추출은 awk 만** — `.env` 에 grep 전면 금지(rtk 재작성 시크릿 노출 3회 이력). `KEY=$(awk -F= '/^FAL_KEY=/{print $2}' .env)` 패턴, 값 stdout 금지.
2. **단가는 추측 금지** — fal 모델 페이지 WebFetch 로 "$X per generation" 실측 후 지출 상한을 먼저 보고. (모델 개편으로 단가가 움직인다.)
3. **파라미터도 추측 금지, 스키마는 공짜** — `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<모델id>`. 단 description 에 제어문자가 있어 `JSON.parse` 가 죽는다 → latin1 로 읽어 `indexOf('...Input')` 슬라이스로 properties 만 본다.
4. **프롬프트에 `no vocals`(필요시 `no drums`) 명시** — 빼면 보컬·리듬이 유입된다.
5. **실존 OST·작품명은 프롬프트에 넣지 않는다**(저작권) — "테일즈위버 같은" 요청은 장르·악기·무드 묘사로 번역한다("gentle lyrical piano-led, nostalgic fantasy MMORPG town theme, wistful, slow"). 스타일 자체는 저작권 대상이 아니다.
6. **fal.media URL 은 영구 보장 없음 → 생성 즉시 로컬 다운로드.** 스크래치는 세션 소멸 → **채택분은 즉시 리포로**(untracked 안착이 안전빵).
7. **청취 게이트 전에는 public/ 에 넣지 않는다** — 후보는 스크래치에 두고 `! afplay <path>` 명령(정지 `! pkill afplay`)을 제시해 판정을 받는다. 채택분만 정규화·안착.
8. **Lyria 429 의 `limit: 0` 은 rate limit 이 아니라 결제 미활성** — 재시도 무의미. fal 경로로 전환.

## Steps

1. **용도 분기 + 견적** — BGM→stable-audio-25 / SFX→cassetteai(함정 2 단가 재확인). 총 발수 × 단가 + 리테이크 배수로 상한을 보고하고 진행.
2. **프롬프트 설계** — 세트는 무드 1개 × 편성 변주 N(예: 피아노+기타 / 솔로 피아노 / +틴휘슬)으로 응집력 유지. BGM 은 `seconds_total` 120 권장(30s 루프는 멜로디 반복 피로).
3. **생성 → 다운로드 → ffprobe** — `curl -X POST https://fal.run/<모델id>` 동기 호출, 응답 url 즉시 다운로드, duration/codec 실측.
4. **청취 게이트(성역)** — 후보별 afplay 명령 나열, 판정 대기. 슬롯별 리테이크 비용을 같이 명시.
5. **채택분 안착** — `ffmpeg -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a aac -b:a 128k` → `public/sounds/` → ffprobe·크기 재실측 + **지출 합산 사실 보고**.

## Verify

- 안착 파일 ffprobe(duration·codec·크기) 실측 일치 · 순환 세트는 loudnorm 동일 타깃 적용.
- 키 값 stdout 노출 0 (세션 로그 기준).
- 지출을 발수 × 실측 단가로 합산 보고(추정 금지).

## Failure / Fallback

- fal 422(파라미터) → 함정 3 스키마 조회 후 재호출(검증 에러는 과금 안 됨).
- Lyria 429 `limit: 0` → 함정 8, fal 로 전환(결제 열리면 최저가 경로로 승급).
- 무드 미달 → 프롬프트의 악기·템포·감정 축만 조정해 슬롯별 리테이크. 전멸 시 ffmpeg lavfi 합성 폴백($0, 품질 하한 낮음 — 환경음만 권장).

## 관련

- 실적: G6 BGM 3곡(tw-piano 세트, 총 $0.80 — 프로브 1 + 채택 3) 2026-07-13 · `emote-lottie`(비주얼 자산 자매 파이프) · `bepo`(배포 시 CF Pages 에 동승).
