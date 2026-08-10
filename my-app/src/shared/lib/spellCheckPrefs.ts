/**
 * 리치 에디터 맞춤법 검사 표시 설정의 로컬 영속화.
 *
 * 이 값은 API 계약(/settings)에 없는 FE 전용 UI 선호도이므로 서버로 동기화하지
 * 않고 localStorage 에만 저장한다. (todoBoardRangeDays 와 동일한 취지)
 */
const KEY = "archive.spellCheck";

export function readSpellCheckPref(fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return fallback;
    return raw === "true";
  } catch {
    return fallback;
  }
}

export function writeSpellCheckPref(value: boolean): void {
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    /* localStorage 접근 불가(프라이빗 모드 등) 시 무시 */
  }
}
