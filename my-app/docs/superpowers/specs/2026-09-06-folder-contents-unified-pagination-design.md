# 폴더 + 회고록 통합 페이지네이션 설계

**작성일**: 2026-09-06
**범위**: api.yaml (`GET /folders/contents`) + FE 폴더 브라우징 훅·갤러리
**연계**: 백엔드 구현 요청서 → `2026-09-06-folder-contents-unified-pagination-backend-prompt.md`

---

## 배경 및 목표

`GET /folders/contents` 는 `page`/`size` 를 **회고록에만** 적용한다. `total` 의 정의부터가 "entries 전체 매칭 건수(페이지 무관)"(api.yaml)이고, 응답의 `folders` 배열에는 페이지네이션 개념이 없다. FE 도 이를 그대로 따른다 — `useFolderContents.ts` 는 직계 하위 폴더를 통째로 반환하고 회고록만 잘라내며, `RetroGallery.tsx` 의 폴더 렌더에는 페이지 가드가 없다.

결과적으로 폴더가 999개면 **모든 페이지가 폴더 999개를 다시 그리고**, 그 뒤에 회고록 20개가 붙는다. 스크롤을 999개 지나야 회고록에 닿고, 999개의 드롭 타깃이 페이지마다 재생성된다.

이 설계는 폴더와 회고록을 **하나의 시퀀스**로 보고 `page`/`size` 를 그 시퀀스에 적용한다.

---

## 1. 정렬 시퀀스

한 폴더(또는 최상위)의 내용물을 다음 순서의 단일 시퀀스로 정의한다.

```
seq = [ 폴더  : name ASC,     id ASC  ]
   ++ [ 회고록: dateKey DESC, id DESC ]
```

폴더 블록이 항상 먼저 오고, 그 뒤에 회고록 블록이 온다(파일 탐색기 멘탈 모델).

**`id` tie-break 는 선택이 아니라 필수다.** 통합 페이지네이션에서는 페이지 경계가 흔들리면 항목이 누락되거나 중복된다. 특히 `retroType` 을 생략한 "전체" 뷰는 daily/weekly/monthly/yearly 를 합치므로 같은 `dateKey` 가 여러 건 나올 수 있다 — 현재 FE 폴백 정렬(`useFolderContents.ts` 의 `dateKey` 단독 비교)에는 tie-break 가 없어 순서가 비결정적이다.

**이름 정렬의 기준은 백엔드 DB 콜레이션이다.** 한글·영문·숫자 혼재 시의 순서는 서버가 정하고, FE 데모/mock 폴백은 `localeCompare("ko")` 로 근사한다. 두 결과가 완전히 일치하지는 않지만, 폴백은 데모 모드에만 쓰이므로 영향 범위가 닫혀 있다.

---

## 2. API 계약 변경 (api.yaml)

### 2-1. 유지하는 것

응답 구조는 그대로 둔다. `folders` / `entries` 분리는 "서로 다른 리소스를 억지로 하나의 배열에 합치지 않는다"는 기존 원칙이고, 통합 페이지네이션은 그 원칙과 무관하게 **오프셋 계산만** 합치면 된다. `items: [{type, ...}]` 단일 배열로 가면 FE 매퍼·타입·렌더를 전부 판별 유니온으로 바꿔야 하는데, 얻는 게 없다.

`page` / `size` 파라미터의 이름·범위(`size` 1..50, 기본 10)도 그대로다.

### 2-2. 바뀌는 것

| 필드 | 기존 | 변경 |
|---|---|---|
| `folders` | 직계 하위 폴더 **전부** | 이 페이지 구간에 걸친 **조각** |
| `entries` | 이 페이지의 회고록 | 이 페이지에서 폴더가 쓰고 남은 칸에 채운 회고록 조각 |
| `total` | 회고록 총건수 | **폴더 총개수 + 회고록 총건수** |

`total` 의 의미가 바뀌는 파괴적 변경이다. 호환 필드나 폴백은 두지 않는다 — FE·BE 동시 배포를 전제한다.

### 2-3. 오프셋 계산

```
offset       = (page - 1) * size
folderTotal  = 직계 하위 폴더 총개수
entryTotal   = 직계 회고록 총건수

folderSlice  = folders[offset : offset + size]          # offset >= folderTotal 이면 []
taken        = len(folderSlice)
entryOffset  = max(0, offset - folderTotal)
entrySlice   = entries[entryOffset : entryOffset + (size - taken)]

total        = folderTotal + entryTotal
```

### 2-4. 예시 (폴더 25 · 회고록 100 · size 20)

| page | folders | entries | 비고 |
|---|---|---|---|
| 1 | 20 | 0 | 폴더만 |
| 2 | 5 | 15 | 경계 페이지 — 두 블록이 섞이는 유일한 페이지 |
| 3–6 | 0 | 20 | 회고록만 |
| 7 | 0 | 5 | 마지막 |

`total` = 125, 총 7페이지.

---

## 3. FE 변경

서버 모드 경로는 변경이 거의 없다. 서버가 잘라서 주고, `totalPages = ceil(total / size)` 는 이미 그대로 맞으며, `RetroGallery` 의 렌더 순서도 이미 폴더 → 회고록이다. 실제 작업은 데모/mock 폴백과 문서·주석이다.

### 3-1. `model/useFolderContents.ts` — 슬라이스 순수 함수

훅 밖에 export 된 순수 함수로 뺀다. 백엔드 구현과 1:1 대조 가능한 형태로 두는 게 목적이다.

```ts
export function sliceFolderContentsPage<F, E>(
  folders: F[],
  entries: E[],
  page: number,
  size: number,
): { folders: F[]; entries: E[]; total: number } {
  const offset = (page - 1) * size;
  const folderSlice = folders.slice(offset, offset + size);
  const entryOffset = Math.max(0, offset - folders.length);
  const entrySlice = entries.slice(
    entryOffset,
    entryOffset + (size - folderSlice.length),
  );
  return {
    folders: folderSlice,
    entries: entrySlice,
    total: folders.length + entries.length,
  };
}
```

### 3-2. `model/useFolderContents.ts` — 클라이언트 폴백

- `clientFolders` 에 `name ASC, id ASC` 정렬 추가 (현재 정렬 없음 — `state.folders` 삽입 순서에 의존)
- `clientAllEntries` 정렬에 `id DESC` tie-break 추가
- `clientPageEntries` 단독 슬라이스를 `sliceFolderContentsPage` 호출로 교체
- `clientTotal` = 폴더 + 회고록 합계

반환값의 `folders` 는 서버 모드든 폴백이든 "이 페이지의 조각"이라는 의미로 통일된다.

### 3-3. `model/useFolderContents.ts` — 페이지 클램프

현재 `page` 는 `totalPages` 로 클램프되지 않는다. 마지막 페이지에서 항목을 지워 `total` 이 줄면 빈 페이지에 갇히고, `RetroGallery` 의 `isEmpty && isPristine` 분기가 페이저까지 감춰 되돌아갈 수단이 사라진다.

기존에도 있던 문제지만 통합 페이지네이션이 노출면을 넓힌다 — 폴더 삭제(`onDeleteFolder` → `refetch`)가 이제 `total` 을 줄이는 경로가 되고, 폴더 999개면 마지막 페이지가 50페이지 근처라 되돌아오기가 더 어렵다. 응답 반영 후 `page > totalPages` 면 마지막 페이지로 내리는 클램프를 추가한다.

### 3-4. `ui/RetroGallery.tsx` — "새 회고록 만들기" 카드

그리드 첫 칸의 CTA 카드가 모든 페이지에 렌더된다. 통합 페이지네이션이 "페이지당 `size` 개"를 실제 약속으로 만드는 만큼, 매 페이지가 `size + 1` 칸이 되는 건 일관되지 않는다. **1페이지에서만** 렌더한다.

`isEmpty` 조건(`listEntries.length === 0 && (!isFolderView || folders.length === 0)`)은 그대로 둔다 — 폴더 조각이 빈 페이지에서도 `listEntries` 가 차 있으면 빈 상태로 판정되지 않는다.

### 3-5. `shared/api/folders.ts`

코드 변경 없음(응답 구조 동일). `apiGetFolderContents` 의 doc 주석에서 `total` 의미와 통합 페이지네이션을 명시한다.

---

## 4. 검증 & 빌드 게이트

이 저장소에는 테스트 프레임워크가 없다(`package.json` 에 test 스크립트 없음, `*.test.*` 0개). 이 변경만을 위해 툴체인을 늘리지 않고 기존 관례를 따른다.

1. `api.yaml` 수정
2. `pnpm gen:api` — `schema.d.ts` 재생성 (`total` 은 타입 변화 없이 description 만 바뀌므로 diff 는 작다)
3. `pnpm build` — tsc + vite 게이트
4. 데모 모드 실측 — 폴더를 `size` 경계 너머로 만들어 페이지 1/2/3 의 폴더·회고록 개수와 총 페이지 수를 확인. 확인 케이스:
   - 폴더 0개 (기존 동작과 동일해야 함)
   - 폴더가 `size` 의 정확한 배수
   - 폴더만 있고 회고록 0개
   - 마지막 페이지

---

## 5. 미결 사항

- **검색·기간 필터 중 폴더가 사라지는 문제** — `GET /folders/contents` 가 `q`/`from`/`to` 를 지원하지 않아 `isFolderView` 가 false 가 되고 폴더 UI 가 통째로 숨는다. 이번 범위 밖이지만 별도로 다룰 가치가 있다.
- **폴더 999개의 근본 대응** — 통합 페이지네이션은 "회고록이 폴더에 묻히는" 문제를 해결하지 않는다(폴더 999개면 여전히 앞 50페이지가 폴더). 폴더 검색·접기가 진짜 해법이며, 이번 설계는 페이지네이션 계약의 정합성만 바로잡는다.
