# snack-web

VTuber 메이커 제품의 랜딩 페이지. **Alibaba.com CoCreate Pitch 2026** 지원 + 일본 런칭용.

- 디자인 무드: [flecto.io](https://flecto.io) 추출 → `design/`
- 텍스트: 단일 파일 `src/content/content.ts` (일본어 우선)
- 스택: Next.js 14 · Tailwind · cva · framer-motion

## 빠른 시작

```bash
npm install
npm run dev      # http://localhost:3000
```

## 어디를 고치나

| 하고 싶은 것 | 파일 |
|---|---|
| 글자(카피)·브랜드명 수정 | `src/content/content.ts` → 가이드 `docs/CONTENT-GUIDE.md` |
| 색·폰트·모션 | `design/DESIGN-TOKENS.md` → `tailwind.config.ts` / `src/lib/motion.ts` |
| 섹션 구조 | `src/components/sections/` |
| 공용 UI(버튼·카드 등) | `src/components/ui/` |
| 배포 | `docs/DEPLOY.md` |

## 폴더

```
design/              디자인 토큰 SSOT (MD) + flecto 추출 원본
docs/                프로젝트 상태·콘텐츠 가이드·배포
src/
  app/               layout(폰트·메타) + page(섹션 조립) + globals.css
  components/
    ui/              cva 공용 프리미티브 (Button·Badge·Card·Section·SectionHeader·Reveal)
    sections/        랜딩 섹션 12종
  content/content.ts ⭐ 모든 텍스트의 단일 원천
  lib/               motion 토큰 · cn()
```

상태: `docs/PROJECT-STATUS.md`
