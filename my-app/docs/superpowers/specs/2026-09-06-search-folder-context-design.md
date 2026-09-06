# 검색 중 폴더 맥락 유지 설계

**작성일**: 2026-09-06
**범위**: api.yaml (`GET /folders` 신규) + FE 회고록 갤러리 검색 경로
**연계**: 백엔드 구현 요청서 → `2026-09-06-search-folder-context-backend-prompt.md`

---

## 배경 및 목표

회고록 갤러리에서 검색어나 기간 필터를 넣는 순간 폴더 UI 가 통째로 사라진다.

```ts
// RetrospectiveStudio.tsx:90
const isFolderView = debouncedSearch.trim() === "" && filterState.dateRange === null;
```

`isFolderView` 가 false 면 폴더 카드가 빈 배열로 넘어가고(`RetrospectiveStudio.tsx:467`), 브레드크럼도 함께 가려진다(`RetroGallery.tsx:317`). `GET /folders/contents` 가 `q`/`from`/`to` 를 지원하지 않아 플랫 뷰(`useRetroEntriesPage`)로 폴백하기 때문이다.

사용자 입장에서는 "2025 아카이브 › 1분기" 안에 있다가 검색어를 치면 아무 예고 없이 전역 검색으로 순간이동하고, 자기가 어디 있었는지 화면에 흔적이 남지 않는다.

**중요한 진단**: `useFolderNav` 의 breadcrumb 상태는 검색 중에도 살아 있다. 검색어를 지우면 원래 폴더로 정확히 돌아온다. 즉 **탐색 상태는 멀쩡하고 표시만 사라지는 문제**다. 이 설계는 대부분 방향 감각 복구이지 탐색 로직 재작성이 아니다.

검색 자체는 폴더를 가로질러 전체를 훑는 동작을 유지한다("검색은 폴더 경계를 넘는다"는 기존 의도). 바꾸는 것은 **사용자가 자기 위치와 검색 범위를 알 수 있게 하는 것**이다.

---

## 1. 검색 중 화면

브레드크럼을 그대로 남기면 "이 폴더 안을 보고 있다"는 거짓말이 된다. 실제 검색 범위는 전역이다. 그래서 폴더 경로를 현재 위치가 아니라 **돌아갈 곳**으로 제시한다.

```
┌──────────────────────────────────────────────────┐
│ 🔍 "회고"  전체에서 검색 중                        │
│    ↩ 2025 아카이브 › 1분기 로 돌아가기             │
└──────────────────────────────────────────────────┘
  [카드] [카드] [카드] …
```

- 브레드크럼(`RetroGallery.tsx:317`)이 있던 자리를 이 검색 상태 바가 대체한다.
- "돌아가기"는 검색어와 기간 필터를 모두 비운다 → `isFolderView` 가 true 로 돌아가고 `useFolderNav` 의 breadcrumb 가 그대로 살아 있으므로 원래 폴더가 복원된다. 별도 상태 저장이 필요 없다.
- **루트에서 검색했으면 이 바를 그리지 않는다** (`breadcrumb.length === 0`) — 돌아갈 곳이 없다.
- 기간 필터만 걸린 경우에도 동일하게 동작한다. `isFolderView` 를 끄는 조건이 검색어와 기간 두 가지이므로, 상태 바 문구는 걸린 필터에 따라 달라진다.

## 2. 결과 카드의 소속 경로 칩

검색 결과가 어느 폴더에서 왔는지 카드에서 바로 보이게 한다.

- `RetroCard` 에 optional `folderPath?: string[]` prop 을 추가하고 `retro-card-meta` 행(날짜 옆)에 칩으로 렌더한다.
- **검색·필터 모드에서만 넘긴다.** 폴더 뷰에서는 화면의 모든 카드가 같은 폴더 소속이라 정보량이 0 이다.
- 경로가 길면 마지막 2단계만 표시(`… › 1분기`)하고 전체 경로는 `title` 속성에 담는다.
- `entry.folderId === null` 이면 "미분류" 칩. 회고록이 폴더 밖에 있다는 것도 정보다.

## 3. `GET /folders` 신규 (백엔드)

FE 는 사용자가 실제로 들어가 본 폴더만 안다(`state.folders` 는 `/folders/contents` 응답 병합으로만 채워진다). 폴더를 id 로 조회하거나 목록으로 가져올 엔드포인트가 **현재 하나도 없다** — `/folders` 는 POST 만, `/folders/{folder_id}` 는 PATCH/DELETE 만 있다. 그래서 검색 결과의 소속 폴더 이름을 알 방법이 없다.

```
GET /folders → { folders: [{ id, name, parentFolderId }] }
```

- **페이지네이션 없음.** 경로 조립에는 전체 집합이 필요하다 — 조상이 몇 번째 페이지에 있을지 알 수 없으므로 페이지로 자르면 전부 받을 때까지 반복 호출해야 한다. 크기는 UUID 2개 + 이름으로 폴더당 약 170B, 999개면 raw 약 170KB(gzip 30~40KB)다. 검색이 처음 켜질 때 1회만 받으므로 감당 가능하다.
- **최대 2000개까지만 반환한다.** 페이지네이션 대신 두는 안전장치다 — 병리적인 폴더 수에서 응답이 무한정 커지는 것만 막는다. 잘려도 `buildFolderPath` 가 모르는 id 에서 멈추고 부분 경로를 반환하므로 칩이 조용히 degrade 할 뿐 깨지지 않는다.
- **`folderCount`/`entryCount` 를 넣지 않는다.** 뱃지는 `/folders/contents` 가 이미 준다. 이 엔드포인트는 경량 유지가 목적이고, 두 카운트는 폴더당 집계 쿼리를 유발한다.
- 정렬은 기존과 같은 `name ASC, id ASC`.

이 엔드포인트는 이번 경로 칩 하나만을 위한 것이 아니다. 5장에서 범위 밖으로 뺀 폴더 트리·폴더 검색·폴더 접기가 전부 이것을 토대로 한다.

## 4. FE 구현

| 파일 | 변경 |
|---|---|
| `api.yaml` | `GET /folders` 추가 → `pnpm gen:api` |
| `shared/api/folders.ts` | `apiListFolders()` 추가 |
| `app/providers/AppProvider.tsx` | `loadAllFolders()` 콜백 — 데모/mock 은 `null` 반환(호출부가 `state.folders` 로 폴백). 기존 `loadFolderContents` 와 같은 형태 |
| `widgets/retrospective-studio/model/useAllFolders.ts` (신규) | lazy 로드 + 캐시 + 무효화. `enabled` 가 처음 true 가 될 때 1회 조회 |
| `widgets/retrospective-studio/model/buildFolderPath.ts` (신규) | `folderId → string[]` 경로 조립 순수 함수. 깊이 상한으로 순환 방지 |
| `widgets/retrospective-studio/ui/RetroGallery.tsx` | 브레드크럼 자리에 검색 상태 바, 카드에 `folderPath` 전달 |
| `widgets/retrospective-studio/ui/RetroCard.tsx` | `folderPath` prop + 칩 렌더 |
| `widgets/retrospective-studio/ui/RetrospectiveStudio.tsx` | `useAllFolders` 배선, 검색·필터 초기화 핸들러 |
| `app/styles/widgets/retro.css` | 검색 상태 바 + 경로 칩 스타일 |
| `shared/lib/i18n/keys.ts` + `locales/{ko,en,ja,zh}.ts` | 신규 키 4개 |

### 로딩 전략

**lazy** — 검색이나 기간 필터가 처음 켜질 때 1회 로드하고 캐시한다. 앱 부팅마다 받을 이유가 없다(폴더를 안 쓰는 사용자가 다수다).

무효화는 폴더 생성·이름변경·이동·삭제 후. 갤러리가 이미 `folderContents.refetch()` 를 부르는 지점들이 있으므로 같은 자리에서 함께 무효화한다.

데모/mock 은 `loadAllFolders()` 가 `null` 을 반환하고 호출부가 `state.folders` 를 그대로 쓴다 — `useFolderContents` 가 쓰는 것과 같은 폴백 패턴이다.

### 경로 조립

```ts
export function buildFolderPath(
  folders: Pick<Folder, "id" | "name" | "parentFolderId">[],
  folderId: string | null,
): string[]
```

`parentFolderId` 사슬을 거슬러 올라가며 이름을 모은다. 깊이 상한(예: 32)으로 순환을 막는다 — 서버가 `FOLDER_CIRCULAR_REFERENCE` 로 막고 있지만, 클라이언트 캐시가 이동 중간 상태를 잡을 수 있으므로 무한 루프를 방지한다. 사슬 중간에 모르는 id 가 나오면 거기서 멈추고 알아낸 만큼만 반환한다.

### 신규 i18n 키

| 키 | ko | en |
|---|---|---|
| `retro.search.scopeGlobal` | 전체에서 검색 중 | Searching everywhere |
| `retro.search.backToFolder` | {path} 로 돌아가기 | Back to {path} |
| `retro.card.unfiled` | 미분류 | Unfiled |
| `retro.search.scopeFiltered` | 전체에서 필터 적용 중 | Filtered across all folders |

`ja`/`zh` 도 함께 채운다(누락 시 컴파일 에러).

## 5. 범위 밖

명시적으로 이번에 하지 않는 것:

- **폴더 자체를 검색 결과에 포함하기** — 이름이 매칭되는 폴더를 카드로 띄우는 것. 백엔드에 폴더 이름 검색이 필요하다.
- **폴더 트리 사이드바 / 폴더 접기**
- **`/entries/paginated` 의 `folderId` 스코프 검색** — "이 폴더 안에서만 검색". 백엔드에 필터 추가가 필요하다.
- **폴더 999개가 앞 페이지를 다 차지하는 문제** — 통합 페이지네이션이 계약 정합성은 고쳤지만 폴더가 회고록을 밀어내는 것은 그대로다. 이 설계도 그것을 풀지 않는다.

## 6. 검증 & 빌드 게이트

이 저장소에는 테스트 프레임워크가 없다(`package.json` 에 test 스크립트 없음). 기존 관례를 따른다.

1. `api.yaml` 수정 → `pnpm gen:api`
2. `pnpm build` (tsc + vite), `pnpm lint` 로 신규 위반 0 확인
3. 데모 모드 실측:
   - 중첩 폴더 안에서 검색 → 상태 바가 뜨고 경로가 맞는지
   - "돌아가기" → 원래 폴더로 복원되는지
   - 루트에서 검색 → 상태 바가 안 뜨는지
   - 결과 카드의 경로 칩이 맞는지, 미분류 회고록은 "미분류"로 나오는지
   - 기간 필터만 걸었을 때도 동일하게 동작하는지

## 7. 미결 사항

- **경로 칩이 카드에서 차지하는 자리**. `retro-card-meta` 행은 이미 날짜와 sync 뱃지를 담고 있다. 개발자 계정(sync 뱃지 표시)에서 세 요소가 한 줄에 들어가는지 실측으로 확인하고, 넘치면 칩을 별도 줄로 내린다.
- **폴더 캐시의 신선도**. lazy 로드 후 다른 기기에서 폴더 이름이 바뀌면 이 세션의 경로 칩은 옛 이름을 보여준다. 경로 칩은 보조 정보이고 다음 무효화 때 맞춰지므로 이번에는 받아들인다.
