# CLAUDE.md — ARCHIVE-FE (레포 공통 규칙)

## 문서 위치 규칙

이 레포의 모든 문서는 **레포 루트의 `docs/`** 한 곳에만 모인다. `my-app/docs/`는 사용하지 않는다.

```
docs/
├── design.md
├── be-request-*.md              # 백엔드에 보내는 요청/제안 문서
└── superpowers/
    ├── plans/                   # writing-plans 스킬 산출물
    └── specs/                   # brainstorming 스킬 산출물
```

- `superpowers:writing-plans`, `superpowers:brainstorming` 스킬은 저장 경로를 `docs/superpowers/plans|specs/...`라는 **상대경로**로 하드코딩하고 있어서, 세션의 현재 작업 디렉터리(cwd)가 레포 루트가 아니면 (예: `my-app/`) 엉뚱한 곳에 문서가 생긴다. **이 스킬들을 실행할 때는 항상 레포 루트에서 실행한다.**
- `.claude/settings.json`에 `my-app/docs/` 밑에 쓰기를 시도하면 차단하고 `docs/`로 안내하는 PreToolUse hook이 걸려 있다. 이 hook에 막히면 해당 파일을 `docs/` 하위 동일 구조로 다시 쓴다.
- `.superpowers/sdd/`는 `subagent-driven-development` 스킬이 쓰는 **git-ignored 스크래치 워크스페이스**다 (레포 루트에 항상 자동으로 고정됨, git에 커밋되지 않음). 이건 문서가 아니라 실행 중 임시 기록(ledger/brief/report)이므로 `docs/`로 옮기지 않는다 — 기능 완료 후 `finishing-a-development-branch` 스킬 절차대로 정리(삭제)한다.
