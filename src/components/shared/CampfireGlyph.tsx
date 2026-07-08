// 대기 글리프 — 마비노기 모닥불 컨셉(방=모닥불)을 joining 화면에서 말하는 장식(aria-hidden).
// spritegen 교체 지점: 이 컴포넌트 내부(CSS 불꽃)만 스프라이트 시트로 바꾸면 소비자 무변경.
// 모션(flick·rise)은 index.css 소유, 형태는 여기 소유.
const FLAME_RADIUS = { borderRadius: '50% 50% 22% 22% / 62% 62% 38% 38%' }

export default function CampfireGlyph() {
  return (
    <div className="relative h-14 w-14" aria-hidden="true">
      <span className="absolute bottom-1 left-1/2 h-[7px] w-[34px] -translate-x-1/2 rotate-[14deg] rounded bg-[#4a3628]" />
      <span className="absolute bottom-1 left-1/2 h-[7px] w-[34px] -translate-x-1/2 -rotate-[14deg] rounded bg-[#4a3628]" />
      <span className="campfire-flame absolute bottom-[9px] left-1/2 -ml-[13px] h-[34px] w-[26px] origin-bottom bg-fire-hot opacity-85" style={FLAME_RADIUS} />
      <span className="campfire-flame mid absolute bottom-[9px] left-1/2 -ml-[8px] h-6 w-[17px] origin-bottom bg-fire-amber" style={FLAME_RADIUS} />
      <span className="campfire-flame core absolute bottom-[9px] left-1/2 -ml-1 h-[13px] w-2 origin-bottom bg-[#ffd98a]" style={FLAME_RADIUS} />
      <span className="campfire-spark absolute bottom-[38px] left-1/2 h-[3px] w-[3px] rounded-full bg-[#ffd98a] opacity-0" />
      <span className="campfire-spark absolute bottom-[38px] left-1/2 ml-1.5 h-[3px] w-[3px] rounded-full bg-[#ffd98a] opacity-0" style={{ animationDelay: '0.9s' }} />
      <span className="campfire-spark absolute bottom-[38px] left-1/2 -ml-[7px] h-[3px] w-[3px] rounded-full bg-[#ffd98a] opacity-0" style={{ animationDelay: '1.5s' }} />
    </div>
  )
}
