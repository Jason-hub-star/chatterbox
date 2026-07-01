---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->

# 12. ModelSelector

내 아바타 선택 화면. Supabase models 테이블 read (`user_id` 필터). 선택 시 `userStore.selectedModelId` 업데이트 → AvatarCanvas 재로드 트리거.

## Props Interface

```typescript
interface ModelSelectorProps {
  /**
   * 선택 완료 콜백
   * signature: (modelId: string) => void
   */
  onSelected?: (modelId: string) => void;

  /**
   * 닫기 콜백
   */
  onClose?: () => void;

  /**
   * 에러 콜백
   */
  onError?: (error: Error) => void;
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `userStore` | `userId` | ✓ | | 본인 ID (user_id 필터) |
| `userStore` | `selectedModelId` | ✓ | ✓ | 선택한 모델 ID (변경 시 AvatarCanvas 재로드) |
| `userStore` | `userModels` | ✓ | ✓ | 보유 모델 목록 (캐시) |

## DataChannel 의존성

**없음**.

## LiveKit 이벤트

**없음**.

## Supabase 접근

| 테이블/Storage | 작업 | RLS 정책 |
|---|---|---|
| `models` | SELECT WHERE user_id = $1 | 자신의 모델만 읽기 |
| `Storage: /models/{user_id}/preview.png` | 썸네일 조회 | 자신의 파일만 읽기 |

**Realtime:** 불필요 (정적 화면).

## 금지 사항 (MUST NOT)

- ❌ 다른 사용자의 모델 변경 (본인만)
- ❌ 선택 후 확인 버튼 없이 즉시 적용 (ux: confirm dialog 권장)
- ❌ 모델 메타정보를 로컬 상태로만 캐싱 (Supabase 재조회 필요)

## 컴포넌트 관계

```
[ModelSelector]
  ├─ read: userStore.userId
  ├─ read/write: userStore.selectedModelId
  ├─ load: models table (user_id filter)
  │
  ├─ [ModelGrid]
  │  └─ [ModelCard] x N
  │     ├─ src: Storage /models/{user_id}/preview.png
  │     ├─ title: model.name
  │     ├─ on click:
  │     │  ├─ set: selected = modelId
  │     │  ├─ show: confirm dialog
  │     │  └─ on confirm:
  │     │     ├─ userStore.selectedModelId = modelId
  │     │     └─ AvatarCanvas re-mount
  │     │
  │     └─ if selected: highlight border
  │
  └─ [Cancel/Select buttons]
     └─ on Select: userStore.selectedModelId = selected
```
