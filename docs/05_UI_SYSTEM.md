# UI System and Interaction Specification

## 1. Experience objective

The product should feel like a calm, high-trust construction QA workspace: dense enough for professional review, clear enough to learn without training, and explicit about evidence, uncertainty, and irreversible actions.

ThreeUI may add controlled visual identity. It must never compete with quantities, forms, tables, or evidence.

## 2. Product principles

1. Evidence before decoration.
2. Status must be visible in text, not color alone.
3. Preserve context during deep review.
4. Never lose work on navigation.
5. Distinguish system fact, statistical signal, AI suggestion, and human decision.
6. Show limitations and skipped evaluations as first-class information.
7. Every long action has truthful state and recovery.
8. Desktop is optimized for dense review; mobile still supports every primary action.

## 3. Visual direction

### Tone

- professional, neutral, technical, restrained;
- high legibility and low visual noise;
- subtle construction/grid references rather than literal blueprint clichés;
- limited motion with purposeful state transitions.

### Color tokens

Use semantic tokens, not raw color names in components.

```text
surface.canvas
surface.panel
surface.elevated
text.primary
text.secondary
text.muted
border.default
border.strong
action.primary
action.secondary
status.success
status.warning
status.danger
status.info
level.deterministic
level.statistical
level.contextual
focus.ring
```

All combinations must meet intended WCAG contrast. Severity and level use icon/label/pattern in addition to color.

### Typography

- UI: a Korean-capable sans-serif with tabular numerals.
- Quantities: tabular numerals and consistent decimal alignment.
- Code/rule/source cell references: restrained monospace.
- Minimum body size: 14–16 CSS px depending on density mode; never shrink critical table text below readable levels.
- Heading hierarchy must be semantic.

### Spacing and density

- Base spacing scale: 4/8/12/16/24/32/48.
- Two density modes may be offered: comfortable and compact.
- Touch targets remain at least 44×44 CSS px on touch layouts even when tables are compact.

## 4. App shell

Desktop:

```text
┌──────────────────────────────────────────────────────────────────┐
│ Product / Project breadcrumb             Search   Help   User    │
├───────────────┬──────────────────────────────────────────────────┤
│ Project nav   │ Page header: title, status, primary action       │
│               ├──────────────────────────────────────────────────┤
│ Overview      │ Content / table / workflow                       │
│ Sources       │                                                  │
│ Mapping       │                                                  │
│ Review runs   │                                                  │
│ Findings      │                                                  │
│ Reports       │                                                  │
│ Audit         │                                                  │
└───────────────┴──────────────────────────────────────────────────┘
```

Mobile:

- top app bar with project/case context;
- navigation in an accessible drawer or bottom sheet;
- primary action remains visible but does not obscure content;
- tables switch to row cards/detail panels only when semantic reading order remains clear.

## 5. Global components

### Page header

- breadcrumb;
- page title and optional description;
- case/run status badge;
- last updated and actor where relevant;
- one primary action, secondary actions in a menu.

### Status badge

Includes icon, text, and optional count. Never relies on color.

### Stepper

For upload → sheets → mapping → data quality → configuration → review.

- current/completed/blocked/optional states;
- keyboard navigable;
- completed steps remain revisitable;
- navigating back must not reset confirmed work;
- blocked step explains prerequisite.

### Data table

- semantic table for moderate data; accessible virtualized/grid approach only if verified;
- sticky header and first context column where useful;
- sort, filter, column visibility, density;
- text overflow with accessible full-value view;
- row selection with explicit bulk action summary;
- pagination/cursor state in URL;
- loading skeleton, empty, filtered-empty, error, stale/conflict states;
- keyboard focus and row detail action;
- export current view only when clearly differentiated from full export.

### Evidence panel

- finding header with Level/Severity/Confidence/State;
- tabs or sections: Summary, Source, Calculation/Comparison, History;
- source reference opens a bounded source preview without losing filters;
- calculation uses aligned operands and result;
- statistical chart is optional and accompanied by textual values;
- limitations are visually distinct but not collapsed by default for high severity.

### Form controls

- persistent labels, help text, error association;
- do not use placeholder as label;
- unit displayed beside quantity input;
- destructive controls visually separated;
- autosave only when status and conflict handling are clear.

### Toast/banner

- toast for non-critical, reversible confirmation;
- inline or page banner for blocking errors and long-lived limitations;
- never show only “something went wrong”; include recovery and correlation ID.

## 6. Screen specifications

### 6.1 Sign-in/access

- Product name, concise purpose, privacy/access explanation.
- Workspace sign-in or supported platform sign-in action.
- Unauthorized state identifies the project/access issue without leaking project data.
- Optional restrained ThreeUI background/mark with static fallback.

### 6.2 Project dashboard

- Search and status filters.
- Cards or table with project code/name, active case count, last run, unresolved high/critical count, owner, last updated.
- Create project action based on permission.
- Recent failures/needs-attention section.
- No confidential quantity detail in cards.

### 6.3 Project detail

- Project metadata and members.
- FIN/RC case list.
- Activity summary.
- Create case; archive project guarded by confirmation.

### 6.4 Case overview

- Current source/dataset/run/report status.
- Next recommended action.
- Blockers and limitations.
- Timeline of source versions and runs.
- FIN/RC profile clearly visible.

### 6.5 Upload

- Drop zone plus file picker; keyboard operable.
- Supported types and limits shown before selection.
- Per-file progress and state.
- Duplicate checksum warning with choice to reuse or intentionally version.
- Validation result with errors/warnings/info.
- No auto-start of review immediately after upload.

### 6.6 Sheet selection/preview

- Sheet list with visibility, dimensions, formula/merged/hidden flags.
- Bounded tabular preview with header candidate highlight.
- User can select header row/data range and include/exclude sheets.
- Hidden content requires explicit acknowledgment when excluded.

### 6.7 Mapping

Three-column pattern:

```text
Source column/sample | Canonical field | Confidence / unit / reason
```

- Recommended mapping labeled as suggestion.
- Required fields grouped by enabled rule family.
- Duplicate canonical targets blocked unless explicitly supported.
- Unit and floor normalization preview.
- Save draft and confirm version.

### 6.8 Data quality

- Summary cards: rows, valid, warnings, errors, excluded.
- Diagnostics table with source links.
- Blocking errors prevent review; warnings may be acknowledged with reason where policy permits.
- Show rules that will be skipped because data is missing.

### 6.9 Review configuration

- Profile/version readout.
- Mandatory rules locked on unless admin policy permits otherwise.
- Optional rule families, tolerance controls within bounds, cohort/floor selection, baselines.
- “What will be evaluated” preview.
- Configuration diff when changing from previous run.

### 6.10 Review progress

- Stage, truthful counts, elapsed time, run ID.
- Explain optional contextual stage and allow A/B-only behavior according to policy.
- Poll without excessive network activity; support page refresh/re-entry.
- Cancel only in safe stages; confirm impact.
- Failure shows completed stages, error code, retry/edit configuration actions.
- Optional ThreeUI progress visualization only as non-essential, lazy enhancement.

### 6.11 Results dashboard

- Counts by Level A/B/C, severity, state, and rule family.
- Unresolved high/critical list.
- Data limitations and skipped rules at top-level.
- Charts only when they answer a review question; all have tabular/text equivalents.
- Navigate to prefiltered findings.

### 6.12 Findings list

- Default sort: blocking/high severity, deterministic level, confidence, source order.
- Filter chips and saved view optional.
- Columns: level, severity, state, rule, item/spec, floor/location/member, actual/expected summary, assignee.
- Row opens evidence panel/page while preserving list URL/scroll state.
- Bulk action preview with selected count and excluded items.

### 6.13 Finding detail

- Plain-language summary and machine evidence.
- Source cell/row preview.
- Original versus effective adjusted values.
- Related/prior-run findings.
- Comment and state timeline.
- Disposition controls filtered by role/current state.
- Closing/exception/correction reasons required.

### 6.14 Adjustments

- Searchable list with row/field/original/effective/reason/author/status.
- Add adjustment from a finding or row.
- Type/unit validation.
- Revoke instead of delete.
- Clear explanation that raw source is unchanged.

### 6.15 Run comparison

- Side-by-side run metadata and change reasons.
- Summary: new/persistent/resolved/rule-changed/not-evaluated.
- Do not label improvement without identifying source/config/rule change.
- Link to paired evidence.

### 6.16 Report and approval

- Preview exact included run/source/profile and unresolved blockers.
- Select allowed report sections; mandatory lineage/disclaimer cannot be removed.
- Generate version, show checksum/status.
- Approver sees conflicts, unresolved high/critical, limitations, reviewer identity.
- Approve/reject with reason; self-approval policy enforced server-side.

### 6.17 Audit

- Filter by time, actor, action, resource, outcome.
- Safe metadata only.
- Export for authorized users.
- Empty/retention-limit explanation.

### 6.18 Admin

- Rule profiles, aliases, tolerance bounds, upload/retention/AI settings.
- Draft/active/retired version states.
- Changes show impact and apply prospectively.

## 7. Content and terminology

Recommended Korean labels:

| Concept            | UI label      |
| ------------------ | ------------- |
| Project            | 프로젝트      |
| Review case        | 검토 건       |
| Source file        | 원본 파일     |
| Mapping            | 열 매핑       |
| Canonical dataset  | 정규화 데이터 |
| Review run         | 검토 실행     |
| Finding            | 검토 항목     |
| Evidence           | 근거          |
| Deterministic      | 확정 계산     |
| Statistical        | 통계 이상     |
| Contextual         | 맥락 검토     |
| Limitation         | 검토 한계     |
| Adjustment         | 보정값        |
| Accepted exception | 예외 인정     |
| Not evaluated      | 미평가        |

Avoid “AI가 오류를 확정했습니다.” Use “계산 규칙에서 불일치가 확인되었습니다” for valid Level A and “AI가 검토 후보를 제안했습니다” for Level C.

## 8. Responsive behavior

Breakpoints are implementation tokens, not hard product rules. Validate at:

- 360×800;
- 768×1024;
- 1280×800;
- 1440×900.

Rules:

- no horizontal page scroll for core routes;
- a dense table may scroll inside a labeled region with sticky context;
- filters collapse into an accessible sheet on small screens;
- evidence detail becomes a full-screen route/sheet on mobile;
- primary action and error recovery stay reachable;
- do not hide required evidence to make mobile fit.

## 9. Accessibility requirements

- Logical landmark and heading structure.
- Skip link to main content.
- Visible focus; no focus trap except a correct modal/dialog.
- Dialogs have name, description, initial focus, escape/close behavior, and focus return.
- Drag/drop has a file-picker equivalent.
- Progress uses accessible status/live regions without noisy announcements.
- Table sort state is announced.
- Charts have summaries/data equivalents.
- Severity/level/state use text.
- Errors are associated with fields and summarized.
- `prefers-reduced-motion` disables non-essential motion.
- 200% zoom and text spacing do not block tasks.
- Korean screen-reader labels are concise and meaningful.

## 10. Motion and ThreeUI

Allowed motion:

- 120–240ms state transitions;
- progress-state change;
- subtle onboarding/empty-state visual;
- optional pointer-responsive effect that stops when hidden/unfocused.

Disallowed:

- looping motion in dense review views;
- scroll-jacking;
- motion conveying the only status meaning;
- forced camera movement;
- shader that reduces text contrast;
- always-on high-DPR rendering on mobile.

Fallback order:

1. full enhancement on capable device when motion allowed;
2. reduced/low-power static frame;
3. semantic CSS/SVG fallback;
4. core interface with no enhancement.

## 11. Performance budgets

Before adopting a ThreeUI item, measure current route and define an incremental budget. Initial guardrails:

- core app shell and review routes should not import Three.js/WebGL code;
- ThreeUI chunks load only on approved routes after core content;
- no layout shift caused by late canvas sizing;
- cap device pixel ratio for 3D rendering;
- pause render loop when offscreen, tab hidden, reduced motion, or component unmounted;
- monitor long tasks and input responsiveness;
- image/font assets subset and cache appropriately;
- a failed 3D chunk cannot fail route rendering.

Final budgets must be set from measured baseline and recorded in `docs/THREEUI_COMPONENT_LOG.md`.

## 12. Empty, loading, error, conflict states

Every data view defines:

- first-use empty with next action;
- filtered empty with clear-filters action;
- loading that preserves layout;
- unauthorized without data leak;
- not found;
- recoverable server error with retry/correlation ID;
- stale optimistic-concurrency conflict with refresh/compare;
- partial data/limitation state;
- offline/network interruption where relevant.

## 13. Visual QA evidence

For each primary route, capture:

- four target viewport screenshots;
- light/dark only if both themes are actually supported;
- keyboard focus sample;
- error and empty state;
- reduced-motion behavior for ThreeUI route;
- no-WebGL fallback;
- a representative long Korean string and large quantity;
- browser console/network errors.

Store evidence under `artifacts/qa/ui/<release>/` with a manifest.
