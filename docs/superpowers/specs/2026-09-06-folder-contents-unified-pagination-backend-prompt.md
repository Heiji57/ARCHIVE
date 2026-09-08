# [백엔드 요청] `GET /folders/contents` — 폴더 + 회고록 통합 페이지네이션

**작성일**: 2026-09-06
**대상 엔드포인트**: `GET /folders/contents` 하나
**성격**: 파괴적 변경(`total` 의 의미가 바뀜) — FE 와 동시 배포 필요
**FE 설계 문서**: `2026-09-06-folder-contents-unified-pagination-design.md`

---

## 1. 문제

지금 `page`/`size` 는 **회고록에만** 적용되고 `folders` 는 직계 하위 폴더를 항상 전부 내려준다. `total` 도 회고록 건수만 센다(현행 스펙: `total: entries 전체 매칭 건수(페이지 무관)`).

그래서 폴더가 999개인 폴더를 열면 **1페이지에도, 2페이지에도, 모든 페이지에** 폴더 999개가 전부 실려 오고 거기에 회고록 20개가 붙는다. 응답 크기가 페이지마다 폴더 999개만큼 반복되고, 화면에서는 폴더 999개를 지나야 회고록에 닿는다.

`page`/`size` 를 폴더와 회고록을 합친 **하나의 시퀀스**에 적용하도록 바꾸고 싶다.

---

## 2. 정렬 시퀀스 (구현의 기준)

한 부모(폴더 또는 최상위)의 내용물을 다음 단일 시퀀스로 정의한다.

```
seq = [ 폴더  : name ASC,      id ASC  ]     ← 먼저
   ++ [ 회고록: date_key DESC, id DESC ]     ← 그 다음
```

폴더 블록이 전부 나온 뒤에 회고록 블록이 시작된다(파일 탐색기 방식). `page`/`size` 는 이 `seq` 에 대한 오프셋이다.

### 정렬에 대한 요구사항

- **`id` tie-break 는 필수다.** 통합 페이지네이션에서는 정렬이 비결정적이면 페이지 경계에서 항목이 누락되거나 중복된다. 특히 `retroType` 을 생략한 "전체" 뷰는 `journal_entries`(daily)와 `retro_summaries`(weekly/monthly/yearly)를 합치므로 같은 `date_key` 가 여러 건 나온다. `ORDER BY date_key DESC` 만으로는 부족하고 `, id DESC` 가 반드시 따라와야 한다.
- **UNION 은 하나의 집합으로 정렬해야 한다.** 두 테이블을 각각 정렬해서 이어붙이면 안 되고, UNION 결과 전체에 `ORDER BY date_key DESC, id DESC` 를 걸고 그 위에 LIMIT/OFFSET 을 적용해야 한다.
- **폴더 이름 정렬의 기준은 DB 콜레이션이다.** 한글·영문·숫자 혼재 시 어떤 순서가 나오는지 한 번 확인해서 알려주면 좋겠다 — FE 데모 모드가 `localeCompare("ko")` 로 근사하고 있어서, 크게 어긋나면 FE 쪽을 맞추겠다.
- **`retroType` 필터는 회고록에만 적용된다.** 폴더는 타입 개념이 없으므로 `retroType` 이 뭐든 폴더 목록·개수는 동일하다. 즉 탭을 바꾸면 `entryTotal` 만 변하고 `folderTotal` 은 그대로다.

---

## 3. 응답 계약

### 3-1. 구조는 그대로 둔다

`folders` / `entries` 분리는 유지한다. "서로 다른 리소스를 하나의 배열에 합치지 않는다"는 기존 원칙 그대로다. **바꾸는 건 오프셋 계산과 `total` 의 정의뿐이다.** `items: [{type, ...}]` 같은 단일 배열로 바꾸지 말 것.

`page` / `size` 파라미터의 이름과 범위(`size` 1..50, 기본 10)도 그대로다.

### 3-2. 바뀌는 세 가지

| 필드 | 기존 | 변경 후 |
|---|---|---|
| `folders` | 직계 하위 폴더 **전부** | `seq` 중 이 페이지 구간에 걸친 **폴더 조각** |
| `entries` | 이 페이지의 회고록 `size` 개 | 이 페이지에서 **폴더가 쓰고 남은 칸**에 채운 회고록 조각 |
| `total` | 회고록 총건수 | **폴더 총개수 + 회고록 총건수** |

`FolderResponse` / `EntryResponse` 각 객체의 필드는 하나도 바뀌지 않는다. 각 폴더의 `folderCount` / `entryCount` 도 지금 계산 그대로다.

### 3-3. 오프셋 계산

```
offset       = (page - 1) * size
folderTotal  = 직계 하위 폴더 총개수            (retroType 무관)
entryTotal   = 직계 회고록 총건수                (retroType 적용)

folderSlice  = 폴더시퀀스[offset : offset + size]        # offset >= folderTotal 이면 []
taken        = len(folderSlice)
entryOffset  = max(0, offset - folderTotal)
entrySlice   = 회고록시퀀스[entryOffset : entryOffset + (size - taken)]

total        = folderTotal + entryTotal
```

SQL 로는 이렇게 된다.

```sql
-- 폴더 조각
SELECT * FROM folders
 WHERE user_id = :uid AND parent_folder_id IS NOT DISTINCT FROM :folder_id
 ORDER BY name ASC, id ASC
 LIMIT :size OFFSET :offset;          -- offset >= folderTotal 이면 자연히 0행

-- 회고록 조각  (taken = 위 결과 행 수)
SELECT * FROM ( <journal_entries UNION ALL retro_summaries, retroType 필터 적용> )
 ORDER BY date_key DESC, id DESC
 LIMIT (:size - :taken) OFFSET GREATEST(0, :offset - :folder_total);
```

`size - taken` 이 0 이면 회고록 쿼리는 건너뛰어도 된다(폴더만 있는 페이지).

### 3-4. 예시로 검산 (폴더 25개 · 회고록 100건 · `size=20`)

| page | offset | folders | entries | 설명 |
|---|---|---|---|---|
| 1 | 0 | 20 | 0 | 폴더만 |
| 2 | 20 | 5 | 15 | 경계 페이지 — 두 블록이 섞이는 유일한 페이지 |
| 3 | 40 | 0 | 20 | `entryOffset = 40 - 25 = 15` |
| 4 | 60 | 0 | 20 | `entryOffset = 35` |
| 5 | 80 | 0 | 20 | `entryOffset = 55` |
| 6 | 100 | 0 | 20 | `entryOffset = 75` |
| 7 | 120 | 0 | 5 | `entryOffset = 95`, 마지막 |

모든 페이지에서 `total = 125`. FE 는 `ceil(125 / 20) = 7` 로 총 페이지 수를 계산한다.

---

## 4. api.yaml 변경

`paths./folders/contents.get.description` 에 정렬 시퀀스와 통합 페이지네이션을 명시하고, `FolderContentsResponse.total` 의 설명을 교체한다.

```yaml
  /folders/contents:
    get:
      description: |
        `folderId` 생략 시 최상위(root) 조회.

        - `retroType` 지정 → 그 타입만(daily=`journal_entries`,
          weekly/monthly/yearly=`retro_summaries`).
        - `retroType` 생략 → 4개 타입을 모두 합쳐 최신순으로 정렬한 "전체" 뷰.

        **페이지네이션은 폴더와 회고록을 합친 하나의 시퀀스에 적용된다.**

            seq = [폴더: name ASC, id ASC] ++ [회고록: date_key DESC, id DESC]

        `page`/`size` 는 이 `seq` 의 오프셋이다. 폴더 블록이 먼저 소진된 뒤
        회고록이 이어진다 — 폴더 25개·회고록 100건·size 20 이면 1페이지는
        폴더 20개, 2페이지는 폴더 5개 + 회고록 15건, 3페이지부터 회고록 20건씩.

        `id` tie-break 는 필수다. "전체" 뷰는 두 테이블을 합치므로 같은
        `date_key` 가 여러 건 나오고, 정렬이 비결정적이면 페이지 경계에서
        항목이 누락되거나 중복된다.

        응답은 `folders`(이 페이지 구간의 폴더 조각)와 `entries`(폴더가 쓰고
        남은 칸에 채운 회고록 조각)로 분리되어 내려온다 — 폴더와 회고록은
        서로 다른 리소스라 하나의 배열로 합치지 않는다(`GET /search` 의
        `{todos, entries}` 분리와 동일한 이유).
```

```yaml
    FolderContentsResponse:
      description: |
        폴더의 직계 하위 폴더와 직계 회고록을, 둘을 합친 단일 시퀀스에 대한
        페이지 조각으로 반환한다. 두 배열을 이어붙인 것이 그 페이지의 내용이며
        `len(folders) + len(entries) <= size` 를 항상 만족한다.
      properties:
        folders:
          type: array
          items: { $ref: "#/components/schemas/FolderResponse" }
          description: 이 페이지 구간에 걸친 폴더 조각(직계 하위 폴더 전부가 아니다).
        entries:
          type: array
          items: { $ref: "#/components/schemas/EntryResponse" }
          description: 이 페이지에서 폴더가 쓰고 남은 칸에 채운 회고록 조각.
        total:
          type: integer
          description: >
            폴더 총개수 + 회고록 총건수(페이지 무관). 폴더 개수는 retroType 과
            무관하고, 회고록 건수에는 retroType 필터가 적용된다.
```

---

## 5. 확인해야 할 경계 케이스

| 상황 | 기대 |
|---|---|
| 폴더 0개 | 기존 동작과 완전히 동일 (`total` = 회고록 건수, 1페이지부터 회고록) |
| 폴더가 `size` 의 정확한 배수 (예: 폴더 20 · size 20) | 1페이지 폴더 20 / 회고록 0, 2페이지 폴더 0 / 회고록 20 — 경계에서 폴더 0개인 페이지가 나와도 정상 |
| 폴더만 있고 회고록 0건 (예: 폴더 25) | `total` = 25, 2페이지 = 폴더 5 + 회고록 0, 총 2페이지 |
| 폴더 0 · 회고록 0 (빈 폴더) | `total` = 0, 두 배열 모두 `[]` (에러 아님) |
| `page` 가 마지막 페이지 초과 | 두 배열 모두 `[]`, `total` 은 정상값 (에러 아님 — FE 가 클램프한다) |
| 마지막 페이지 | `len(folders) + len(entries)` 가 `size` 미만 |
| `retroType` 전환 | `folderTotal` 불변, `entryTotal` 만 변함 → `total` 과 페이지 경계가 함께 이동 |
| 폴더 999개 | 1페이지 응답에 폴더 `size` 개만 실림 (999개가 아니라) |

---

## 6. 배포

`total` 의 의미가 바뀌는 파괴적 변경이라 **FE 와 동시 배포**가 필요하다. 호환 필드나 버전 분기는 두지 않기로 했다.

- 백엔드만 먼저 나가면: FE 가 `total` 을 회고록 건수로 해석해 총 페이지 수를 과다 계산하고, 폴더가 잘려 온 걸 전부로 오해한다.
- FE 만 먼저 나가면: 폴더가 매 페이지 반복되고 총 페이지 수가 모자란다.

배포 시점을 맞출 수 있게 준비되면 알려주면 좋겠다.
