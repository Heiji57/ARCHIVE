import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Todo } from "@/entities/todo/model/types";
import { StatusIcon } from "@/entities/todo/ui/StatusIcon";
import { TagDots } from "@/entities/todo/ui/TagDots";
import { useTranslation } from "@/shared/lib/i18n";
import {
  HOUR_PX,
  MIN_BLOCK_MIN,
  MINUTES_IN_DAY,
  PX_PER_MIN,
  assignLanes,
  buildTimeline,
  formatTime,
  parseTime,
  snap,
  type TimelineBlock,
} from "../model/timeline";
import {
  currentMinutes,
  layoutFreeDrag,
  visualSpan,
} from "../model/timelineDrag";

export interface DayTimelineProps {
  dayKey: string;
  todayKey: string;
  todos: Todo[];
  /** 마감일 지정 할 일(dateKey < dueDate) 전체 목록 — 오늘에 걸친 것만 필터링해서 span 블록으로 표시. */
  spanningTodos?: Todo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReschedule: (id: string, startTime: string, endTime: string) => void;
  /** 시간 제거(미지정으로 전환). */
  onUntime: (id: string) => void;
  onAddTodo?: (title: string, dateKey: string, opts: { startTime: string; endTime: string }) => void;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DRAG_THRESHOLD_PX = 4;

function shortDate(dateKey: string) {
  const [, m, d] = dateKey.split("-");
  return `${parseInt(m)}/${parseInt(d)}`;
}
/** 미지정 칩을 타임라인에 놓을 때 기본 블록 길이(분). */
const CHIP_DROP_MIN = 60;

type DragMode = "pending" | "free" | "resize-top" | "resize-bottom";

interface DragState {
  id: string;
  startMin: number;
  endMin: number;
  durationMin: number;
  pointerStartY: number;
  pointerStartX: number;
  deltaMin: number;
  moved: boolean;
  mode: DragMode;
  /** 드래그 시작 시점의 레인 인덱스. */
  dragBlockLane: number;
  trackWidth: number;
  /** 커서 X 절대 위치로 결정되는 목표 레인. */
  targetLane: number;
}

/** 미지정 칩 → 타임라인 드래그 상태(렌더용). */
interface ChipDragState {
  id: string;
  title: string;
  status: Todo["status"];
  x: number;
  y: number;
  /** 커서가 타임라인(시간 영역) 위인지 — true 면 고스트가 블록 형태로 변신. */
  overTimeline: boolean;
  /** overTimeline 일 때 놓일 시작 분(15분 스냅). */
  startMin: number;
  /** 원본 칩 UI 의 측정 크기(px) — 칩 형태 고스트 크기. */
  chipW: number;
  chipH: number;
  /** 타임라인 블록 너비(px) — 블록 형태 고스트 너비(트랙 1레인 폭). */
  blockW: number;
}

function pointInEl(x: number, y: number, el: HTMLElement | null): boolean {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

export function DayTimeline({
  dayKey,
  todayKey,
  todos,
  spanningTodos,
  selectedId,
  onSelect,
  onReschedule,
  onUntime,
  onAddTodo,
}: DayTimelineProps) {
  const { t } = useTranslation();
  const isToday = dayKey === todayKey;

  const daySpanTodos = useMemo(
    () =>
      (spanningTodos ?? []).filter(
        (t) => t.dateKey <= dayKey && (t.dueDate ?? t.dateKey) >= dayKey,
      ),
    [spanningTodos, dayKey],
  );

  /** span 블록 각각의 시작/종료 분 — 시작일이면 startTime~자정, 마감일이면 00:00~endTime, 중간일은 전일. */
  const daySpanBlocks = useMemo(
    () =>
      daySpanTodos.map((todo) => {
        const isStartDay = todo.dateKey === dayKey;
        const isEndDay = todo.dueDate === dayKey;
        const startMin = isStartDay ? (parseTime(todo.startTime) ?? 0) : 0;
        const endMin = isEndDay
          ? (parseTime(todo.endTime) ?? MINUTES_IN_DAY)
          : MINUTES_IN_DAY;
        return { todo, startMin, endMin };
      }),
    [daySpanTodos, dayKey],
  );

  /** span 할 일 ID 집합 — buildTimeline 결과에서 제거해 span 블록으로만 단일 표시. */
  const spanTodoIds = useMemo(
    () => new Set(daySpanTodos.map((t) => t.id)),
    [daySpanTodos],
  );

  const { blocks: allRawBlocks, untimed: allRawUntimed } = useMemo(
    () => buildTimeline(todos, dayKey),
    [todos, dayKey],
  );

  const rawBlocks = useMemo(
    () => allRawBlocks.filter((b) => !spanTodoIds.has(b.todo.id)),
    [allRawBlocks, spanTodoIds],
  );
  const untimed = useMemo(
    () => allRawUntimed.filter((t) => !spanTodoIds.has(t.id)),
    [allRawUntimed, spanTodoIds],
  );

  /** 사용자가 드래그로 지정한 블록별 선호 레인. 빈 레인일 때만 적용돼 충돌이 없다. */
  const [lanePrefs, setLanePrefs] = useState<Record<string, number>>({});

  /** 레인 배정: regular 블록만 독립 계산 — span과 레인 풀을 공유하지 않는다. */
  const regularLanes = useMemo(
    () =>
      assignLanes(
        rawBlocks.map(visualSpan),
        rawBlocks.map((b) => lanePrefs[b.todo.id]),
      ),
    [rawBlocks, lanePrefs],
  );

  const blocks = useMemo(
    () => rawBlocks.map((b, i) => ({ ...b, ...regularLanes[i] })),
    [rawBlocks, regularLanes],
  );

  /** span 블록끼리만 독립적으로 레인 배정 — regular 블록 위치와 무관. */
  const spanLanes = useMemo(
    () => assignLanes(daySpanBlocks.map(visualSpan)),
    [daySpanBlocks],
  );

  const spanBlocksLaned = useMemo(
    () => daySpanBlocks.map((b, i) => ({ ...b, ...spanLanes[i] })),
    [daySpanBlocks, spanLanes],
  );

  const [drag, setDrag] = useState<DragState | null>(null);
  const [nowMin, setNowMin] = useState(() => currentMinutes());
  const [addState, setAddState] = useState<{ startMin: number } | null>(null);
  const [addTitle, setAddTitle] = useState("");
  /** 블록을 미지정 영역 위로 끌고 있는지(드롭 시 시간 제거) — 강조용. */
  const [blockOverUntimed, setBlockOverUntimed] = useState(false);
  /** 미지정 칩 드래그(렌더용). */
  const [chipDrag, setChipDrag] = useState<ChipDragState | null>(null);
  /** 타임라인 블록을 미지정 영역 위로 끌 때 따라다닐 칩 고스트 커서 위치. */
  const [blockGhostPos, setBlockGhostPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const addInputRef = useRef<HTMLInputElement | null>(null);
  const untimedRef = useRef<HTMLDivElement | null>(null);

  // 칩 드래그 보조 ref (포인터 업 판정에 최신값 사용)
  const chipStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const chipUpRef = useRef<{
    id: string;
    moved: boolean;
    overTimeline: boolean;
    startMin: number;
    clientY: number;
  } | null>(null);

  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNowMin(currentMinutes()), 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const focusMin = isToday ? currentMinutes() : 8 * 60;
    el.scrollTop = Math.max(0, focusMin * PX_PER_MIN - 140);
  }, [dayKey, isToday]);

  useEffect(() => {
    setLanePrefs({});
  }, [dayKey]);

  /** 커서 clientY → 타임라인 시작 분(15분 스냅). 트랙 rect 은 스크롤을 이미 반영한다. */
  const trackStartMinFromClientY = (clientY: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const relY = clientY - rect.top;
    return snap(
      Math.max(0, Math.min(MINUTES_IN_DAY - CHIP_DROP_MIN, relY / PX_PER_MIN)),
    );
  };

  const handlePointerDown = (e: React.PointerEvent, block: TimelineBlock) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      id: block.todo.id,
      startMin: block.startMin,
      endMin: block.endMin,
      durationMin: block.endMin - block.startMin,
      pointerStartY: e.clientY,
      pointerStartX: e.clientX,
      deltaMin: 0,
      moved: false,
      mode: "pending",
      dragBlockLane: block.lane,
      trackWidth: trackRef.current?.clientWidth ?? 300,
      targetLane: block.lane,
    });
  };

  const handleResizeDown = (
    e: React.PointerEvent,
    block: TimelineBlock,
    mode: "resize-top" | "resize-bottom",
  ) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      id: block.todo.id,
      startMin: block.startMin,
      endMin: block.endMin,
      durationMin: block.endMin - block.startMin,
      pointerStartY: e.clientY,
      pointerStartX: e.clientX,
      deltaMin: 0,
      moved: false,
      mode,
      dragBlockLane: block.lane,
      trackWidth: 0,
      targetLane: block.lane,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // free 드래그 중 미지정 영역 위 여부 — 드롭 시 시간 제거 강조 + 칩 고스트로 모핑.
    if (drag && (drag.mode === "free" || drag.mode === "pending")) {
      const over = pointInEl(e.clientX, e.clientY, untimedRef.current);
      setBlockOverUntimed(over);
      setBlockGhostPos(over ? { x: e.clientX, y: e.clientY } : null);
    }

    setDrag((prev) => {
      if (!prev) return prev;

      const rawDeltaY = e.clientY - prev.pointerStartY;
      const rawDeltaX = e.clientX - prev.pointerStartX;
      const movedNow =
        Math.max(Math.abs(rawDeltaX), Math.abs(rawDeltaY)) > DRAG_THRESHOLD_PX;
      const moved = prev.moved || movedNow;

      const { deltaMin, targetLane } = prev;
      let mode = prev.mode;

      // pending → free 전환 (임계값 초과 시)
      if (mode === "pending" && moved) mode = "free";

      if (mode === "free") {
        // Y: 시간 오프셋 (15분 스냅)
        const snappedMin = snap(rawDeltaY / PX_PER_MIN);
        const newDeltaMin = Math.max(
          -prev.startMin,
          Math.min(MINUTES_IN_DAY - prev.durationMin - prev.startMin, snappedMin),
        );

        // X: 새 위치에서의 클러스터 레인 수를 시뮬레이션 → 커서 X 를 레인 인덱스로
        const ns = prev.startMin + newDeltaMin;
        const dragSpan = visualSpan({ startMin: ns, endMin: ns + prev.durationMin });
        const spans = blocks.map((b) =>
          b.todo.id === prev.id ? dragSpan : visualSpan(b),
        );
        const sim = assignLanes(spans);
        const dragIdx = blocks.findIndex((b) => b.todo.id === prev.id);
        const numLanes = Math.max(1, sim[dragIdx]?.lanes ?? 1);
        const trackLeft = trackRef.current?.getBoundingClientRect().left ?? 0;
        const laneWidthPx = prev.trackWidth / numLanes;
        const newTargetLane = Math.max(
          0,
          Math.min(numLanes - 1, Math.floor((e.clientX - trackLeft) / laneWidthPx)),
        );

        if (newDeltaMin === deltaMin && newTargetLane === targetLane && moved === prev.moved)
          return prev;
        return { ...prev, deltaMin: newDeltaMin, targetLane: newTargetLane, moved, mode };
      }

      if (mode === "resize-bottom") {
        const raw = snap(rawDeltaY / PX_PER_MIN);
        const newDelta = Math.max(
          MIN_BLOCK_MIN - prev.durationMin,
          Math.min(MINUTES_IN_DAY - prev.endMin, raw),
        );
        if (newDelta === deltaMin && moved === prev.moved) return prev;
        return { ...prev, deltaMin: newDelta, moved };
      }

      if (mode === "resize-top") {
        const raw = snap(rawDeltaY / PX_PER_MIN);
        const newDelta = Math.max(
          -prev.startMin,
          Math.min(prev.durationMin - MIN_BLOCK_MIN, raw),
        );
        if (newDelta === deltaMin && moved === prev.moved) return prev;
        return { ...prev, deltaMin: newDelta, moved };
      }

      // pending — 아직 임계값 미달
      if (moved !== prev.moved) return { ...prev, moved };
      return prev;
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!drag) return;

    const d = drag;
    setDrag(null);
    const overUntimed = blockOverUntimed;
    setBlockOverUntimed(false);
    setBlockGhostPos(null);

    if (d.mode === "free") {
      // 미지정 영역에 놓으면 시간 제거.
      if (d.moved && overUntimed) {
        setLanePrefs((p) => {
          const rest = { ...p };
          delete rest[d.id];
          return rest;
        });
        onUntime(d.id);
        return;
      }
      const timeChanged = d.deltaMin !== 0;
      const laneChanged = d.targetLane !== d.dragBlockLane;
      if (timeChanged || laneChanged) {
        const ns = d.startMin + d.deltaMin;
        const ne = ns + d.durationMin;
        // 프리뷰와 동일한 함수로 선호 레인 확정 → 놓은 위치가 프리뷰 그대로 유지
        const { prefs } = layoutFreeDrag(blocks, lanePrefs, d.id, ns, ne, d.targetLane);
        setLanePrefs(prefs);
        if (timeChanged) onReschedule(d.id, formatTime(ns), formatTime(ne));
      } else if (!d.moved) {
        onSelect(d.id);
      }
    } else if (d.mode === "resize-bottom" && d.deltaMin !== 0) {
      const newEnd = Math.max(
        d.startMin + MIN_BLOCK_MIN,
        Math.min(MINUTES_IN_DAY, d.endMin + d.deltaMin),
      );
      // 시간 범위 변경 → 클러스터 구조가 바뀌므로 이전 선호 레인 초기화
      setLanePrefs({});
      onReschedule(d.id, formatTime(d.startMin), formatTime(newEnd));
    } else if (d.mode === "resize-top" && d.deltaMin !== 0) {
      const newStart = Math.max(
        0,
        Math.min(d.endMin - MIN_BLOCK_MIN, d.startMin + d.deltaMin),
      );
      setLanePrefs({});
      onReschedule(d.id, formatTime(newStart), formatTime(d.endMin));
    } else if (!d.moved && d.mode === "pending") {
      onSelect(d.id);
    }
  };

  // ─── 미지정 칩 → 타임라인 드래그 (영역 기반 모핑 고스트) ──────────────────────
  // 커서가 타임라인 위면 고스트가 "블록", 미지정 영역 위면 "칩" 형태. 1초 정지 없이
  // 영역 진입 즉시 전환되며, 너비 transition 으로 양옆 stretch 효과를 낸다.
  const handleChipPointerDown = (e: React.PointerEvent, todo: Todo) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // 원본 칩 UI 의 실제 크기 측정 → 고스트 칩 형태 크기로 사용.
    const chipRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // 블록 형태 너비 = 트랙(1레인) 폭. 실제 블록 width:calc(100% - 6px) 와 맞춘다.
    const blockW = Math.max(80, (trackRef.current?.clientWidth ?? 240) - 6);
    chipStartRef.current = { x: e.clientX, y: e.clientY };
    chipUpRef.current = {
      id: todo.id,
      moved: false,
      overTimeline: false,
      startMin: 0,
      clientY: e.clientY,
    };
    setChipDrag({
      id: todo.id,
      title: todo.title,
      status: todo.status,
      x: e.clientX,
      y: e.clientY,
      overTimeline: false,
      startMin: 0,
      chipW: Math.round(chipRect.width),
      chipH: Math.round(chipRect.height),
      blockW,
    });
  };

  const handleChipPointerMove = (e: React.PointerEvent) => {
    const up = chipUpRef.current;
    if (!up) return;
    const x = e.clientX;
    const y = e.clientY;

    const movedNow =
      Math.max(
        Math.abs(x - chipStartRef.current.x),
        Math.abs(y - chipStartRef.current.y),
      ) > DRAG_THRESHOLD_PX;
    const overTimeline = pointInEl(x, y, scrollRef.current);
    const startMin = overTimeline ? trackStartMinFromClientY(y) : 0;
    up.moved = up.moved || movedNow;
    up.overTimeline = overTimeline;
    up.startMin = startMin;
    up.clientY = y;

    setChipDrag((prev) =>
      prev ? { ...prev, x, y, overTimeline, startMin } : prev,
    );
  };

  const handleChipPointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const up = chipUpRef.current;
    chipUpRef.current = null;
    setChipDrag(null);
    if (!up) return;

    if (!up.moved) {
      onSelect(up.id);
      return;
    }
    if (up.overTimeline) {
      const startMin = up.startMin;
      const endMin = Math.min(MINUTES_IN_DAY, startMin + CHIP_DROP_MIN);
      onReschedule(up.id, formatTime(startMin), formatTime(endMin));
    }
  };

  /**
   * 드래그 중 실시간 레이아웃.
   * - free: layoutFreeDrag (커밋과 동일한 함수)로 시간 이동 + 레인 재배치.
   * - resize-*: 해당 엣지 시간 조정 후 선호 레인을 유지한 채 재배치.
   */
  const previewBlocks = useMemo(() => {
    if (!drag) return blocks;

    if (drag.mode === "free") {
      const ns = drag.startMin + drag.deltaMin;
      const ne = ns + drag.durationMin;
      const { layout } = layoutFreeDrag(
        blocks,
        lanePrefs,
        drag.id,
        ns,
        ne,
        drag.targetLane,
      );
      return blocks.map((b, i) =>
        b.todo.id === drag.id
          ? { ...b, startMin: ns, endMin: ne, derived: false, ...layout[i] }
          : { ...b, ...layout[i] },
      );
    }

    if (drag.mode === "resize-bottom" || drag.mode === "resize-top") {
      const placed = blocks.map((b) => {
        if (b.todo.id !== drag.id) return b;
        if (drag.mode === "resize-bottom") {
          const ne = Math.max(
            drag.startMin + MIN_BLOCK_MIN,
            Math.min(MINUTES_IN_DAY, drag.endMin + drag.deltaMin),
          );
          return { ...b, endMin: ne, derived: false };
        }
        const ns = Math.max(
          0,
          Math.min(drag.endMin - MIN_BLOCK_MIN, drag.startMin + drag.deltaMin),
        );
        return { ...b, startMin: ns, derived: false };
      });
      const lanes = assignLanes(
        placed.map(visualSpan),
        placed.map((p) => lanePrefs[p.todo.id]),
      );
      return placed.map((p, i) => ({ ...p, ...lanes[i] }));
    }

    return blocks; // pending
  }, [blocks, drag, lanePrefs]);

  return (
    <div className="day-timeline">
      {/* 시간 미지정 영역 — 항상 표시(드롭 존). 블록을 끌어다 놓으면 시간 제거됨. */}
      <div
        className="day-allday"
        ref={untimedRef}
        data-drop-active={blockOverUntimed ? "" : undefined}
      >
        <span className="day-allday-label">{t("calendar.timeline.untimed")}</span>
        <div className="day-allday-items">
          {untimed.length > 0 ? (
            untimed.map((todo) => (
              <button
                key={todo.id}
                type="button"
                className="day-allday-chip"
                data-status={todo.status}
                data-dragging={chipDrag?.id === todo.id ? "" : undefined}
                aria-pressed={selectedId === todo.id}
                onPointerDown={(e) => handleChipPointerDown(e, todo)}
                onPointerMove={handleChipPointerMove}
                onPointerUp={handleChipPointerUp}
                onPointerCancel={handleChipPointerUp}
              >
                <StatusIcon status={todo.status} size={12} />
                <span className="day-allday-chip-title">{todo.title}</span>
                <TagDots tags={todo.tags} />
              </button>
            ))
          ) : (
            <span className="day-allday-empty">
              {t("calendar.timeline.untimedEmpty")}
            </span>
          )}
        </div>
      </div>

      <div className="day-timeline-scroll" ref={scrollRef}>
        <div
          className="day-timeline-grid"
          style={{
            height: 24 * HOUR_PX,
            userSelect: drag || chipDrag ? "none" : undefined,
          }}
        >
          {HOURS.map((h) => (
            <div
              key={h}
              className="day-hour-row"
              style={{ top: h * HOUR_PX, height: HOUR_PX }}
            >
              <span className="day-hour-label">{formatTime(h * 60)}</span>
              <span className="day-hour-line" />
            </div>
          ))}

          {isToday ? (
            <div className="day-now-line" style={{ top: nowMin * PX_PER_MIN }}>
              <span className="day-now-pill">{formatTime(nowMin)}</span>
            </div>
          ) : null}

          <div
            className="day-timeline-track"
            ref={trackRef}
            onClick={(e) => {
              if (!onAddTodo) return;
              if ((e.target as Element).closest(".day-block")) return;
              // 트랙 rect.top 은 스크롤을 이미 반영하므로 scrollTop 을 더하지 않는다.
              const startMin = trackStartMinFromClientY(e.clientY);
              setAddState({ startMin });
              setAddTitle("");
              setTimeout(() => addInputRef.current?.focus(), 0);
            }}
          >
            {spanBlocksLaned.map((b) => {
              const durationMin = b.endMin - b.startMin;
              const top = b.startMin * PX_PER_MIN;
              const height = Math.max(durationMin, MIN_BLOCK_MIN) * PX_PER_MIN;
              const laneWidth = 100 / b.lanes;
              return (
                <div
                  key={b.todo.id}
                  className="day-block"
                  data-status={b.todo.status}
                  data-active={selectedId === b.todo.id ? "" : undefined}
                  data-span=""
                  style={{
                    top,
                    height,
                    left: `calc(${b.lane * laneWidth}% + 2px)`,
                    width: `calc(${laneWidth}% - 6px)`,
                  }}
                  onClick={() => onSelect(b.todo.id)}
                >
                  <div className="day-block-head">
                    <StatusIcon status={b.todo.status} size={12} />
                    <span className="day-block-title">{b.todo.title}</span>
                    <TagDots tags={b.todo.tags} />
                  </div>
                  <span className="day-block-time">
                    {shortDate(b.todo.dateKey)} – {shortDate(b.todo.dueDate!)}
                  </span>
                </div>
              );
            })}

            {previewBlocks.map((b) => {
              const dragging = drag?.id === b.todo.id;
              // 드래그 블록이 미지정 영역 위면 칩 고스트로 대체 → 시각적으로만 숨긴다.
              // (DOM 에서 제거하면 setPointerCapture 가 풀려 드래그가 멈추므로 opacity 로 숨김)
              const hiddenForUntimed = dragging && blockOverUntimed;
              const durationMin = b.endMin - b.startMin;
              const top = b.startMin * PX_PER_MIN;
              const height = Math.max(durationMin, MIN_BLOCK_MIN) * PX_PER_MIN;
              const laneWidth = 100 / b.lanes;
              const compact = height < 44;

              return (
                <div
                  key={b.todo.id}
                  className="day-block"
                  data-status={b.todo.status}
                  data-active={selectedId === b.todo.id ? "" : undefined}
                  data-dragging={dragging ? "" : undefined}
                  style={{
                    top,
                    height,
                    left: `calc(${b.lane * laneWidth}% + 2px)`,
                    width: `calc(${laneWidth}% - 6px)`,
                    opacity: hiddenForUntimed ? 0 : undefined,
                  }}
                  onPointerDown={(e) => handlePointerDown(e, b)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  <div
                    className="day-block-resize day-block-resize-t"
                    onPointerDown={(e) => handleResizeDown(e, b, "resize-top")}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  />

                  <div className="day-block-head">
                    <StatusIcon status={b.todo.status} size={12} />
                    <span className="day-block-title">{b.todo.title}</span>
                    <TagDots tags={b.todo.tags} />
                  </div>
                  {!compact ? (
                    <span className="day-block-time">
                      {formatTime(b.startMin)} –{" "}
                      {formatTime(b.startMin + durationMin)}
                    </span>
                  ) : null}

                  <div
                    className="day-block-resize day-block-resize-b"
                    onPointerDown={(e) => handleResizeDown(e, b, "resize-bottom")}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  />
                </div>
              );
            })}

            {/* 빈 시간 클릭 → 인라인 추가 입력 */}
            {addState ? (
              <div
                className="day-add-block"
                style={{
                  position: "absolute",
                  top: addState.startMin * PX_PER_MIN,
                  left: 2,
                  right: 6,
                  zIndex: 20,
                }}
              >
                <input
                  ref={addInputRef}
                  className="day-add-input"
                  placeholder={t("calendar.addCard.placeholder")}
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && addTitle.trim()) {
                      onAddTodo!(
                        addTitle.trim(),
                        dayKey,
                        {
                          startTime: formatTime(addState.startMin),
                          endTime: formatTime(Math.min(MINUTES_IN_DAY, addState.startMin + 60)),
                        },
                      );
                      setAddState(null);
                      setAddTitle("");
                    } else if (e.key === "Escape") {
                      setAddState(null);
                      setAddTitle("");
                    }
                  }}
                  onBlur={() => {
                    setAddState(null);
                    setAddTitle("");
                  }}
                />
                <span className="day-add-time">
                  {formatTime(addState.startMin)} – {formatTime(Math.min(MINUTES_IN_DAY, addState.startMin + 60))}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* 미지정 칩 드래그 고스트 — 영역에 따라 칩↔블록 모핑(단일 엘리먼트, 너비/높이 stretch).
          - 칩 형태: 측정한 원본 칩 크기, 커서 중앙 정렬로 따라다님.
          - 블록 형태: 실제 1시간 블록처럼 트랙 폭 × 1시간 높이. 트랙 안쪽(좌측 정렬 +
            해당 시각 슬롯)에 배치해 시간 지정 영역을 벗어나지 않게 한다. */}
      {chipDrag
        ? // 드래그 고스트 위치는 트랙의 현재 화면 좌표(getBoundingClientRect)가 필요해
          // 렌더 시점에 ref 를 읽는다 — 측정용 escape hatch라 refs 규칙을 예외 처리한다.
          // eslint-disable-next-line react-hooks/refs
          (() => {
            let style: React.CSSProperties;
            if (chipDrag.overTimeline) {
              const r = trackRef.current?.getBoundingClientRect();
              style = {
                left: (r?.left ?? chipDrag.x) + 2,
                top: (r?.top ?? chipDrag.y) + chipDrag.startMin * PX_PER_MIN,
                width: chipDrag.blockW,
                height: CHIP_DROP_MIN * PX_PER_MIN,
                // 트랙 좌상단 기준 배치 → 커서 중앙 정렬 transform 해제.
                transform: "none",
              };
            } else {
              style = {
                left: chipDrag.x,
                top: chipDrag.y,
                width: chipDrag.chipW,
                height: chipDrag.chipH,
              };
            }
            return createPortal(
              <div
                className="chip-drag-ghost"
                data-form={chipDrag.overTimeline ? "block" : "chip"}
                style={style}
              >
                <StatusIcon status={chipDrag.status} size={12} />
                <span className="chip-drag-ghost-title">{chipDrag.title}</span>
                {chipDrag.overTimeline ? (
                  <span className="chip-drag-ghost-time">
                    {formatTime(chipDrag.startMin)}–
                    {formatTime(chipDrag.startMin + CHIP_DROP_MIN)}
                  </span>
                ) : null}
              </div>,
              document.body,
            );
          })()
        : null}

      {/* 타임라인 블록을 미지정 영역 위로 끌면 칩 UI 고스트로 변경 */}
      {drag?.mode === "free" && blockOverUntimed && blockGhostPos
        ? (() => {
            const dragged = blocks.find((b) => b.todo.id === drag.id);
            if (!dragged) return null;
            return createPortal(
              <div
                className="chip-drag-ghost"
                data-form="chip"
                style={{ left: blockGhostPos.x, top: blockGhostPos.y, maxWidth: 220 }}
              >
                <StatusIcon status={dragged.todo.status} size={12} />
                <span className="chip-drag-ghost-title">{dragged.todo.title}</span>
              </div>,
              document.body,
            );
          })()
        : null}
    </div>
  );
}
