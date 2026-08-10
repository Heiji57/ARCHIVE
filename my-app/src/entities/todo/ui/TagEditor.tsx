import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { MAX_TAGS_PER_TODO, MAX_TAG_LENGTH } from "@/entities/todo/model/types";
import { tagColor } from "@/entities/todo/lib/tagColor";
import { apiSearchTags } from "@/shared/api";
import { useTranslation } from "@/shared/lib/i18n";

export interface TagEditorProps {
  /** 이 할 일에 이미 붙어 있는 태그 목록. */
  tags: string[];
  /** 검색 대상 전체 태그 후보 (다른 할 일에서 이미 쓰인 태그들). */
  suggestions: string[];
  /** 입력 전(포커스 직후) 보여줄 "최근 사용" 태그 — 최신순으로 미리 정렬돼 온다. */
  recentTags: string[];
  onChange: (tags: string[]) => void;
  autoFocus?: boolean;
  /** 태그 입력창이 포커스를 잃을 때(다른 곳 클릭 등) 호출 — "편집 완료" 시점 감지용. */
  onBlur?: () => void;
}

type SuggestRow =
  | { kind: "tag"; value: string }
  | { kind: "create"; value: string };

const MAX_VISIBLE_MATCHES = 8;
const SEARCH_DEBOUNCE_MS = 200;

function highlightMatch(label: string, query: string): ReactNode {
  if (!query) return label;
  const idx = label.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return label;
  return (
    <>
      {label.slice(0, idx)}
      <b className="tag-suggest-match">{label.slice(idx, idx + query.length)}</b>
      {label.slice(idx + query.length)}
    </>
  );
}

/**
 * 토큰형 태그 편집기 — 칩으로 표시된 현재 태그 + 커스텀 자동완성 드롭다운 달린
 * 추가 입력. 포커스만 하면 "최근 사용"(recentTags, 클라이언트 계산) 섹션을,
 * 타이핑하면 "검색 결과" 섹션을 보여준다. 검색 결과는 GET /todos/tags/search
 * (서버 FTS, 이 사용자의 전체 태그 이력 대상)를 디바운스 호출해 채우고, 요청
 * 실패 시(데모 모드 등 인증 없는 환경 포함) suggestions prop 을 클라이언트에서
 * 부분일치 필터링한 결과로 자연스럽게 폴백한다. 보드 카드 팝오버와 상세 패널
 * 양쪽에서 재사용된다.
 */
export function TagEditor({
  tags,
  suggestions,
  recentTags,
  onChange,
  autoFocus,
  onBlur,
}: TagEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const atLimit = tags.length >= MAX_TAGS_PER_TODO;
  const query = draft.trim();

  // 서버 검색 결과 — null 이면 아직 없음(요청 전/진행 중/실패), 그 경우 suggestions
  // prop 을 클라이언트에서 필터링해 대신 보여준다(데모 모드 등에서도 자연 폴백).
  const [serverMatches, setServerMatches] = useState<string[] | null>(null);
  const searchSeqRef = useRef(0);

  useEffect(() => {
    if (query === "") {
      setServerMatches(null);
      return;
    }
    const seq = ++searchSeqRef.current;
    const timer = window.setTimeout(() => {
      apiSearchTags(query, MAX_VISIBLE_MATCHES)
        .then((tags) => {
          if (searchSeqRef.current === seq) setServerMatches(tags);
        })
        .catch(() => {
          if (searchSeqRef.current === seq) setServerMatches(null);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const addTag = (value: string) => {
    const v = value.trim().slice(0, MAX_TAG_LENGTH);
    if (!v || atLimit || tags.includes(v)) return;
    onChange([...tags, v]);
  };

  const commitRaw = (raw: string) => {
    addTag(raw);
    setDraft("");
    setActiveIndex(0);
  };

  const remove = (tag: string) => onChange(tags.filter((x) => x !== tag));

  // ── 자동완성 후보 계산 ──────────────────────────────────────────────────────
  const excludeSet = new Set(tags);
  const alreadyAdded = query !== "" && tags.some((x) => x.toLowerCase() === query.toLowerCase());
  // 서버 검색 결과가 있으면 그걸(이미 접두 매칭+빈도순 정렬된 상태) 기준으로,
  // 없으면(폴백) suggestions prop 기준으로 "이미 다른 데서 쓰인 태그인지" 판단.
  const activeSuggestions = serverMatches ?? suggestions;
  const existsElsewhere = activeSuggestions.some((s) => s.toLowerCase() === query.toLowerCase());

  const rows: SuggestRow[] =
    query === ""
      ? recentTags.filter((s) => !excludeSet.has(s)).map((s) => ({ kind: "tag", value: s }))
      : (() => {
          const q = query.toLowerCase();
          const filtered = activeSuggestions.filter((s) => !excludeSet.has(s));
          // 서버 결과는 이미 접두 매칭+정렬된 상태로 오므로 그대로 자르기만 하고,
          // 폴백(클라이언트 suggestions)만 부분일치 필터 + startsWith 우선 정렬한다.
          const matches: SuggestRow[] =
            serverMatches !== null
              ? filtered.slice(0, MAX_VISIBLE_MATCHES).map((s) => ({ kind: "tag", value: s }))
              : filtered
                  .filter((s) => s.toLowerCase().includes(q))
                  .sort((a, b) => {
                    const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
                    const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
                    if (aStarts !== bStarts) return aStarts - bStarts;
                    return a.localeCompare(b);
                  })
                  .slice(0, MAX_VISIBLE_MATCHES)
                  .map((s) => ({ kind: "tag", value: s }));
          const canCreate = !alreadyAdded && !existsElsewhere && query.length <= MAX_TAG_LENGTH;
          return canCreate ? [...matches, { kind: "create", value: query }] : matches;
        })();

  const selectRow = (row: SuggestRow) => {
    addTag(row.value);
    setDraft("");
    setActiveIndex(0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, Math.max(rows.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && rows[activeIndex]) selectRow(rows[activeIndex]);
      else commitRaw(draft);
    } else if (e.key === ",") {
      e.preventDefault();
      commitRaw(draft);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      remove(tags[tags.length - 1]);
    }
  };

  const showDropdown = open && !atLimit && rows.length > 0;
  const showEmptyHint = open && !atLimit && query !== "" && rows.length === 0;

  return (
    <div className="tag-editor">
      <div className="tag-editor-chips">
        {tags.map((tag) => (
          <span key={tag} className="tag-chip">
            <span className="tag-chip-dot" style={{ background: tagColor(tag) }} />
            {tag}
            <button
              type="button"
              className="tag-chip-remove"
              aria-label={t("todo.tag.remove", { tag })}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => remove(tag)}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {atLimit ? null : (
          <input
            className="tag-editor-input"
            value={draft}
            autoFocus={autoFocus}
            placeholder={t("todo.tag.placeholder")}
            onChange={(e) => {
              setDraft(e.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              setOpen(false);
              commitRaw(draft);
              onBlur?.();
            }}
          />
        )}
      </div>

      {atLimit ? (
        <p className="tag-editor-hint">{t("todo.tag.limit", { max: MAX_TAGS_PER_TODO })}</p>
      ) : showDropdown ? (
        <div className="tag-suggest">
          <p className="tag-suggest-section">
            {t(query === "" ? "todo.tag.recent" : "todo.tag.searchResults")}
          </p>
          {rows.map((row, i) => (
            <button
              key={row.kind === "create" ? `__create__${row.value}` : row.value}
              type="button"
              className="tag-suggest-row"
              data-active={i === activeIndex ? "" : undefined}
              data-kind={row.kind}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => selectRow(row)}
            >
              {row.kind === "tag" ? (
                <>
                  <span className="tag-chip-dot" style={{ background: tagColor(row.value) }} />
                  <span className="tag-suggest-label">{highlightMatch(row.value, query)}</span>
                </>
              ) : (
                <>
                  <Plus size={12} />
                  <span className="tag-suggest-label">
                    {t("todo.tag.createNew", { tag: row.value })}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      ) : showEmptyHint ? (
        <div className="tag-suggest">
          <p className="tag-suggest-empty">{t("todo.tag.noResults")}</p>
        </div>
      ) : null}
    </div>
  );
}
