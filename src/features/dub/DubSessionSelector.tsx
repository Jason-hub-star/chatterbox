import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDubStore } from '@/stores/dubStore'
import { setRoomMode } from '@/lib/rooms'
import {
  uploadDubSource, createDubSession, startTranscription, translateDubScript, separateDubAudio,
  type DubLang,
} from '@/lib/dub'
import { trimVideo, clampTrimRange, estimateTrimBytes, type TrimRange } from '@/lib/ffmpeg'

// 계약: contracts/DubSessionSelector.md — 세션 생성(호스트): 파일 선택 → 트림(DUB-TRIM) → 원본 언어 →
// 업로드 → STT → 번역 → 분리(S1) 자동 연쇄. DubPanel 674줄 분할(2026-07-19) — 동작 불변 추출:
// 업로드 전용 상태(file/trim/프리뷰)가 통째로 이사, 파이프라인 phase 는 셸과 공유(재시도 브랜치 겸용).

export type DubPipelinePhase = 'trimming' | 'uploading' | 'transcribing' | 'translating' | 'separating' | null

interface Props {
  token: string
  roomId: string
  busy: boolean
  phase: DubPipelinePhase
  setPhase: (p: DubPipelinePhase) => void
  sourceLanguage: DubLang
  setSourceLanguage: (l: DubLang) => void
  run: (fn: () => Promise<unknown>) => void
}

export default function DubSessionSelector({ token, roomId, busy, phase, setPhase, sourceLanguage, setSourceLanguage, run }: Props) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  // DUB-TRIM: 파일 프리뷰 URL(핸들러에서 생성/해제 — effect setState 회피)·총 길이·선택 구간(null=전체)
  const fileUrlRef = useRef<string | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [videoDurMs, setVideoDurMs] = useState<number | null>(null)
  const [trim, setTrim] = useState<TrimRange | null>(null)
  // 트림 UI 는 기본 접힘(주인님 피드백 — 대부분 전체 업로드) · 25MB 초과 파일만 자동 펼침(트림이 필수라서)
  const [trimOpen, setTrimOpen] = useState(false)
  const previewRef = useRef<HTMLVideoElement | null>(null)

  // DUB-TRIM: 파일 선택(핸들러에서 objectURL 수명 관리 — 이전 URL 즉시 해제)
  const pickFile = (f: File | null) => {
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current)
    fileUrlRef.current = f ? URL.createObjectURL(f) : null
    setFile(f); setFileUrl(fileUrlRef.current); setVideoDurMs(null); setTrim(null)
    setTrimOpen(f ? f.size > 25 * 1024 * 1024 : false)
  }
  useEffect(() => () => { if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current) }, [])

  const fmtT = (msTotal: number) =>
    `${Math.floor(msTotal / 60000)}:${String(Math.floor((msTotal % 60000) / 1000)).padStart(2, '0')}`

  // 선택구간 재생: 시작으로 시킹 → 끝에서 pause(리스너는 트리거 시 자가 제거)
  const playTrimRange = () => {
    const v = previewRef.current
    if (!v || !trim) return
    v.currentTime = trim.startMs / 1000
    const stopAt = trim.endMs / 1000
    const onTime = () => {
      if (v.currentTime >= stopAt) { v.pause(); v.removeEventListener('timeupdate', onTime) }
    }
    v.addEventListener('timeupdate', onTime)
    void v.play().catch(() => {})
  }

  return (
    <div className="mt-3 space-y-3">
      {/* 1) 영상 선택 — label 이 파일 input 을 감싸 "큰 버튼"으로(어포던스 명확·#14/#18). 파일 고르면 이름 표시. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stage-border px-4 py-2 text-sm font-medium text-stage-text transition hover:border-fire-amber/60 hover:bg-stage-border/30 focus-within:ring-1 focus-within:ring-fire-amber">
          <span aria-hidden>📁</span>{t('dub.pickFileButton')}
          <input
            type="file" accept="video/mp4,video/webm,audio/mp4,audio/mpeg,audio/wav"
            className="sr-only"
            onChange={(e) => pickFile(e.currentTarget.files?.[0] ?? null)}
            aria-label={t('dub.sourceFileLabel')}
          />
        </label>
        {file
          ? <span className="text-xs text-stage-text">{file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB</span>
          : <span className="text-xs text-stage-text-muted">{t('dub.fileNote')}</span>}
      </div>
      {/* DUB-TRIM v1: 프리뷰 + 구간 선택(기본 = 전체 → 무회귀). 절단은 업로드 클릭 시 1회. */}
      {file && fileUrl && (
        <details
          open={trimOpen}
          onToggle={(e) => setTrimOpen(e.currentTarget.open)}
          className="rounded-lg border border-stage-border p-3"
        >
          <summary className="cursor-pointer text-xs text-stage-text-muted hover:text-stage-text">
            {t('dub.trimSummary')}{videoDurMs != null ? ` · ${fmtT(videoDurMs)}` : ''}
            {/* 감사 픽스: 25MB 초과 = 자동 펼침 이유를 명시(왜 갑자기 열렸는지) */}
            {file.size > 25 * 1024 * 1024 && <span className="ml-1 text-fire-hot">{t('dub.trimRequiredHint')}</span>}
          </summary>
          <div className="mt-2 space-y-2">
          <video
            ref={previewRef} src={fileUrl} controls preload="metadata"
            className="max-h-48 w-full rounded"
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration
              if (Number.isFinite(d) && d > 0) {
                const durMs = Math.round(d * 1000)
                setVideoDurMs(durMs)
                setTrim({ startMs: 0, endMs: durMs })
              }
            }}
          >
            <track kind="captions" />
          </video>
          {trim && videoDurMs != null && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-stage-text-muted">{t('dub.trimLabel')}</p>
              <label className="flex items-center gap-2 text-xs text-stage-text-muted">
                <span className="w-8 shrink-0">{t('dub.trimStart')}</span>
                <input
                  type="range" min={0} max={videoDurMs} step={100} value={trim.startMs}
                  onChange={(e) => setTrim(clampTrimRange(videoDurMs, Number(e.target.value), trim.endMs))}
                  className="flex-1 accent-fire-amber"
                />
                <span className="w-10 text-right tabular-nums">{fmtT(trim.startMs)}</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-stage-text-muted">
                <span className="w-8 shrink-0">{t('dub.trimEnd')}</span>
                <input
                  type="range" min={0} max={videoDurMs} step={100} value={trim.endMs}
                  onChange={(e) => setTrim(clampTrimRange(videoDurMs, trim.startMs, Number(e.target.value)))}
                  className="flex-1 accent-fire-amber"
                />
                <span className="w-10 text-right tabular-nums">{fmtT(trim.endMs)}</span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={playTrimRange}
                  className="rounded-lg border border-stage-border px-3 py-1.5 text-xs hover:bg-stage-border/30"
                >
                  {t('dub.trimPlayRange')}
                </button>
                <span className={`text-xs ${estimateTrimBytes(file.size, videoDurMs, trim) > 25 * 1024 * 1024 ? 'text-fire-hot' : 'text-stage-text-muted'}`}>
                  {t('dub.trimEstSize', {
                    sec: Math.round((trim.endMs - trim.startMs) / 1000),
                    mb: (estimateTrimBytes(file.size, videoDurMs, trim) / 1024 / 1024).toFixed(1),
                  })}
                  {estimateTrimBytes(file.size, videoDurMs, trim) > 25 * 1024 * 1024 && ` — ${t('dub.trimTooLarge')}`}
                </span>
              </div>
            </div>
          )}
          </div>
        </details>
      )}
      {/* 2) 원본 언어(DUB-LANG) — STT/번역 힌트. 방 UI 언어와 분리(안 고르면 STT 오인식+번역 스킵). */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-stage-text-muted">{t('dub.sourceLanguageLabel')}</span>
        <select
          value={sourceLanguage}
          onChange={(e) => setSourceLanguage(e.currentTarget.value as DubLang)}
          aria-label={t('dub.sourceLanguageLabel')}
          className="rounded-lg border border-stage-border bg-stage-base px-2 py-2 text-sm text-stage-text focus:ring-1 focus:ring-fire-amber"
        >
          <option value="ja">{t('dub.lang_ja')}</option>
          <option value="en">{t('dub.lang_en')}</option>
          <option value="ko">{t('dub.lang_ko')}</option>
        </select>
      </div>
      {/* 3) 시작 — 파일 없으면 비활성 + "왜 회색인지" 명시(#13/#17). 호버·포커스 피드백 추가. */}
      <div>
        <button
          disabled={!file || busy}
          onClick={() => run(async () => {
            try {
              // DUB-TRIM: 전체 범위면 기존 경로 그대로(무회귀). 아니면 절단 후 실측 크기로 25MB 재판정.
              let src = file!
              const full = !trim || videoDurMs == null || (trim.startMs <= 0 && trim.endMs >= videoDurMs)
              if (!full) {
                setPhase('trimming')
                try {
                  src = await trimVideo(file!, trim!.startMs, trim!.endMs)
                } catch (trimErr) {
                  const err = new Error(t('dub.trimFailed')) as Error & { cause?: unknown }
                  err.cause = trimErr
                  throw err
                }
                if (src.size > 25 * 1024 * 1024) throw new Error(t('dub.trimTooLarge'))
              }
              setPhase('uploading')
              const path = await uploadDubSource(token, roomId, src)
              const sess = await createDubSession(token, roomId, path, sourceLanguage)
              // G-261: 더빙 세션 개시 = 방 모드 'dub'(서버 broadcast → 전원 탭 전환+배너). best-effort.
              void setRoomMode(token, roomId, 'dub').catch(() => {})
              // 의상실처럼: 기계적 AI 단계는 물어보지 않고 자동 연쇄 — 대본 추출(STT) → 번역(비-ko).
              // 사람이 필요한 역할배정/동의/녹음 전까지 흐른다. 번역 실패는 비치명(대본은 남음 → 수동 재번역 가능).
              setPhase('transcribing')
              await startTranscription(token, sess.dub_session_id)
              if (sourceLanguage !== 'ko') {
                setPhase('translating')
                await translateDubScript(token, sess.dub_session_id).catch(() => {})
              }
              // S1 분리 선행: 기존 목소리 제거 스템을 미리 만들어 캐시(베드·A/B 토글 재료). 실패 비치명.
              setPhase('separating')
              await separateDubAudio(token, sess.dub_session_id)
                .then((r) => useDubStore.getState().setBedUrls(r.background_urls))
                .catch(() => {})
            } finally { setPhase(null) }
          })}
          className="rounded-lg bg-fire-amber px-4 py-2 text-sm font-semibold text-stage-base transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-fire-amber focus-visible:ring-offset-1 disabled:opacity-40"
        >
          {phase === 'trimming' ? t('dub.trimming')
            : phase === 'transcribing' ? t('dub.pipelineTranscribing')
            : phase === 'translating' ? t('dub.pipelineTranslating')
            : phase === 'separating' ? t('dub.phaseSeparating')
            : busy ? t('dub.uploadLoading') : t('dub.uploadButton')}
        </button>
        {!file && !busy && <p className="mt-1 text-[11px] text-stage-text-muted">{t('dub.pickFirstHint')}</p>}
        {busy && <p className="mt-1 text-[11px] text-stage-text-muted">{t('dub.pipelineNote')}</p>}
      </div>
    </div>
  )
}
