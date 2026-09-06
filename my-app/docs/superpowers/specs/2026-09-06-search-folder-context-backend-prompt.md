# [백엔드 요청] `GET /folders` 신규 — 전체 폴더 목록

**작성일**: 2026-09-06
**대상**: 새 엔드포인트 하나 추가
**성격**: 순수 추가 — 기존 엔드포인트·스키마 변경 없음. 파괴적 변경 아님
**FE 설계 문서**: `2026-09-06-search-folder-context-design.md`

---

## 1. 왜 필요한가

회고록 갤러리에서 검색어를 넣으면 폴더를 가로질러 전체를 검색한다. 이때 각 결과가 **어느 폴더에서 나왔는지** 카드에 보여주려 한다("2025 아카이브 › 1분기").

그런데 FE 는 사용자가 실제로 들어가 본 폴더의 이름만 안다. 폴더 정보가 `GET /folders/contents` 응답으로만 들어오기 때문이다. 검색 결과는 한 번도 열어본 적 없는 폴더에서 나올 수 있고, 그 폴더의 이름을 알아낼 방법이 현재 계약에 **하나도 없다**:

| 경로 | 현재 정의된 메서드 |
|---|---|
| `/folders` | `POST` (생성) 만 |
| `/folders/contents` | `GET` — 직계 하위만, 조상은 알 수 없음 |
| `/folders/{folder_id}` | `PATCH`, `DELETE` — **GET 없음** |

회고록 응답(`EntryResponse`)에는 `folderId` 가 이미 들어 있으므로, id → 이름을 해결할 수단만 있으면 된다.

## 2. 요청 사항

```
GET /folders
```

사용자의 **전체 폴더**를 평평한 배열로 반환한다.

### 파라미터

없다. 페이지네이션도 없다.

**페이지네이션을 넣지 말아 달라.** 경로 조립에는 전체 집합이 필요하다 — 어떤 폴더의 조상이 몇 번째 페이지에 있을지 알 수 없으므로 페이지로 잘라 주면 FE 가 전부 다 받을 때까지 반복 호출해야 한다. 이 엔드포인트는 검색이 처음 켜질 때 1회만 호출된다(FE 가 lazy 로드 후 캐시한다).

크기는 UUID 2개 + 이름으로 폴더당 약 170B — 폴더 999개면 raw 약 170KB(gzip 30~40KB)다. 1회 호출이라 감당 가능한 크기다.

다만 상한은 하나 두고 싶다: **최대 2000개까지만 반환**해 달라(초과분은 잘라도 된다). 페이지네이션 대신 두는 안전장치로, 병리적인 폴더 수에서 응답이 무한정 커지는 것만 막는 목적이다. FE 의 경로 조립은 사슬 중간에 모르는 id 를 만나면 거기서 멈추고 부분 경로만 보여주도록 이미 짜여 있어, 잘려도 칩이 조용히 degrade 할 뿐 깨지지 않는다.

### 응답

```jsonc
{
  "status": "success",
  "code": "OK",
  "data": {
    "folders": [
      { "id": "f_1", "name": "2025 아카이브", "parentFolderId": null },
      { "id": "f_2", "name": "1분기",         "parentFolderId": "f_1" }
    ]
  }
}
```

- 정렬: `name ASC, id ASC` — `GET /folders/contents` 의 폴더 정렬과 같은 규칙.
- 폴더가 없으면 `folders: []` (에러 아님).
- 인증 필요. 자기 폴더만.

### 필드를 최소로 유지해 달라

`FolderResponse` 를 그대로 재사용하지 말고 **`id` / `name` / `parentFolderId` 세 필드만** 담은 새 스키마를 써 주면 좋겠다.

이유는 `FolderResponse` 의 `folderCount` / `entryCount` 때문이다. 이 두 값은 폴더당 집계가 필요한데, 이 엔드포인트는 전체 폴더를 반환하므로 폴더 수만큼 집계가 붙는다. 그런데 FE 는 여기서 그 값을 **쓰지 않는다** — 폴더 카드의 뱃지는 `/folders/contents` 가 주는 값을 그대로 쓴다. 이 응답은 오직 id → 이름 → 조상 사슬을 따라가기 위한 것이다.

`created_at` / `updated_at` / `user_id` 도 같은 이유로 불필요하다.

## 3. api.yaml 변경

`/folders` 에 `get` 을 추가한다(기존 `post` 는 그대로).

```yaml
  /folders:
    get:
      tags: [folders]
      summary: 전체 폴더 목록 — id·이름·부모만
      description: |
        사용자의 모든 폴더를 평평한 배열로 반환한다. 페이지네이션 없음.

        용도는 **id → 이름 → 조상 사슬 해결**이다. 검색 결과처럼 폴더를
        가로지르는 목록에서 각 항목의 소속 폴더 경로("A › B › C")를 조립할 때,
        FE 는 한 번도 열어본 적 없는 폴더의 이름이 필요하다. `GET
        /folders/contents` 는 직계 하위만 주므로 조상을 알 수 없다.

        폴더 카드 뱃지용 개수(`folderCount`/`entryCount`)는 담지 않는다 —
        전체 폴더에 대해 집계를 걸게 되는데 이 응답의 소비처는 그 값을 쓰지
        않는다. 뱃지는 `GET /folders/contents` 가 주는 값을 그대로 쓴다.

        정렬은 `name ASC, id ASC` — `GET /folders/contents` 의 폴더 정렬과 동일.
      responses:
        "200":
          description: 조회 성공
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ApiResponseFolderList" }
        "401":
          $ref: "#/components/responses/Unauthorized_401"

    post:
      # ... 기존 그대로 ...
```

스키마 두 개를 추가한다.

```yaml
    FolderSummaryResponse:
      type: object
      required: [id, name]
      description: |
        폴더의 최소 식별 정보. 경로 조립(id → 이름 → 조상)에만 쓰이므로
        개수·타임스탬프를 담지 않는다. 뱃지가 필요하면 FolderResponse 를 쓸 것.
      properties:
        id: { type: string }
        name: { type: string }
        parentFolderId:
          type: string
          nullable: true
          description: 최상위 폴더면 null.

    FolderListResponse:
      type: object
      required: [folders]
      properties:
        folders:
          type: array
          items: { $ref: "#/components/schemas/FolderSummaryResponse" }

    ApiResponseFolderList:
      allOf:
        - $ref: "#/components/schemas/ApiResponseEmpty"
        - type: object
          properties:
            data: { $ref: "#/components/schemas/FolderListResponse" }
```

## 4. 구현 메모

기존 폴더 리포지터리에 "이 사용자의 전체 폴더" 조회가 이미 있는지 먼저 확인해 달라. 없다면 `find_all(user_id)` 수준의 단순한 메서드 하나면 된다 — `parent_folder_id` 조건 없이 `ORDER BY name ASC, id ASC`.

`GET /folders/contents` 가 쓰는 `_children_scope` 계열 헬퍼가 있다면 그 옆에 나란히 두는 게 자연스럽다.

## 5. 확인해야 할 경계 케이스

| 상황 | 기대 |
|---|---|
| 폴더 0개 | `folders: []`, 200 (에러 아님) |
| 최상위 폴더만 | 전부 `parentFolderId: null` |
| 깊게 중첩된 폴더 | 모든 depth 가 한 배열에 평평하게 담김 (트리로 감싸지 말 것) |
| 다른 사용자의 폴더 | 포함되지 않음 |
| 미인증 | 401 |

## 6. 배포

**파괴적 변경이 아니다.** 순수 추가라 기존 클라이언트에 영향이 없고, FE 가 이 엔드포인트를 쓰기 전에 먼저 배포되어도 무해하다. 백엔드가 먼저 나가도 되고, 순서를 맞출 필요가 없다.

FE 는 이 엔드포인트가 없으면 경로 칩을 그리지 않는 쪽으로 동작한다(폴더 이름을 모르면 칩 생략).
