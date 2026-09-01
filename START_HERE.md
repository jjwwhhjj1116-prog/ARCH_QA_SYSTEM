# START HERE — FIN & RC Review Studio

이 폴더는 Codex가 추가 설명 없이 FIN & RC AI Quantity Review Studio를 구현하기 위한 실행 패키지다.

## Codex가 가장 먼저 할 일

1. 저장소 루트에서 작업하고 있는지 확인한다.
2. `AGENTS.md`를 읽고 그 지시를 현재 실행의 최상위 프로젝트 규칙으로 사용한다.
3. 아래 문서를 순서대로 읽는다.
   - `docs/00_MASTER_PRD.md`
   - `docs/01_ORCHESTRATOR.md`
   - `docs/02_ARCHITECTURE.md`
   - `docs/03_DATA_MODEL.md`
   - `docs/04_REVIEW_ENGINE.md`
   - `docs/05_UI_SYSTEM.md`
   - `docs/06_ACCEPTANCE_CRITERIA.md`
   - `docs/07_QA_PLAN.md`
   - `docs/08_CODING_AND_REPO_RULES.md`
   - `docs/09_SECURITY_AND_PRIVACY.md`
   - `docs/10_THREEUI_MCP.md`
   - `docs/11_RELEASE_CHECKLIST.md`
4. 기존 코드가 있으면 먼저 구조, 실행 방법, 테스트, 현재 변경사항을 읽기 전용으로 조사한다. 사용자 변경을 덮어쓰지 않는다.
5. `tasks/BACKLOG.md`에서 Phase 0 항목을 시작한다. 구현 전에 `docs/DECISION_LOG.md`의 미확정 항목을 실제 환경 조사 결과로 채운다.
6. 독립적으로 수행 가능한 조사·검증에만 서브에이전트를 사용한다. 파일 소유권이 겹치는 구현을 동시에 시작하지 않는다.
7. 첫 구현 커밋 전에 다음 계약을 고정한다.
   - Sites 호환 프로젝트 형태와 로컬 실행 명령
   - D1/R2 바인딩 이름
   - 인증 및 권한 방식
   - 업로드 지원 범위와 크기 제한
   - 정규화 행 스키마와 Finding 스키마
   - API 오류 봉투와 감사로그 규칙
8. 각 Phase가 끝날 때 해당 수용 기준과 QA 증거를 `artifacts/qa/`에 기록한다.
9. 승인된 저장 버전을 만들기 전에는 배포하지 않는다. Sites 배포 URL은 프로덕션이므로 사용자가 명시적으로 승인하기 전에는 배포, 공개 범위 변경, 외부 공유를 하지 않는다.

## Codex에 넣을 첫 프롬프트

아래 문장을 그대로 사용한다.

> 이 저장소의 `START_HERE.md`와 `AGENTS.md`를 읽고 FIN & RC Review Studio 구현을 시작해. `docs/01_ORCHESTRATOR.md`의 단계와 게이트를 따르고, 먼저 Phase 0 조사와 계약 고정만 완료해. 조사·검증처럼 독립적인 일은 지정된 서브에이전트에 병렬 위임하고 결과를 취합해. 기존 사용자 변경은 보존해. 아직 배포하거나 접근 범위를 바꾸지 마. Phase 0이 끝나면 확정된 아키텍처, 남은 차단 이슈, 첫 구현 배치, 검증 명령을 요약한 뒤 안전한 다음 작업을 계속 진행해.

## 기본 제품 결정

추가 입력이 없으면 다음을 기본값으로 사용한다.

- 제품명: `FIN & RC Review Studio`
- 성격: 건설 물량산출 자료를 검토하는 비공개 업무용 웹 애플리케이션
- 기본 언어: 한국어 UI, 영문 코드·식별자
- 기본 시간대: `Asia/Seoul`, DB 시각은 UTC 저장
- 기본 플랫폼: Codex Sites 권장 TypeScript 풀스택 스타터
- 영속 데이터: D1
- 원본 파일과 생성 보고서: R2
- 인증: workspace identity 우선. 공개 배포가 필요한 경우에만 Sign in with ChatGPT를 별도 설계
- 최초 지원 입력: XLSX, CSV. 레거시 XLS/PDF/도면은 명시적 검증 전 자동 파싱을 약속하지 않음
- 최초 보고서: XLSX와 인쇄 가능한 HTML/PDF 경로. 실제 Sites 런타임에서 안정적인 방식을 선택
- AI 원칙: AI는 Level C 보조 판정과 설명에만 사용하고, 산술 확정 판정은 결정론 엔진이 담당
- 배포 원칙: owner/admin 전용 검토 → 저장 버전 → QA 승인 → 명시적 배포 승인 → 최소 권한 공유

## 시작 전 차단 조건

아래 중 하나가 발생해도 가능한 조사·스캐폴딩·테스트 설계는 계속한다. 단, 해당 기능을 완료로 표시하지 않는다.

- Sites 접근 권한 또는 D1/R2 프로비저닝이 없음
- ThreeUI Pro MCP 인증이 없음
- 실제 FIN/RC 샘플 파일이 없음
- 조직별 기준값이나 검토 규칙이 없음
- 외부 AI 공급자 키가 없음

ThreeUI MCP가 없으면 `docs/10_THREEUI_MCP.md`의 Community fallback을 사용한다. 샘플 파일이 없으면 합성 fixture로 파서와 엔진을 구현하되, 실제 업무 적합성은 `needs-domain-validation` 상태로 남긴다.

## 완료의 정의

화면이 보이는 것만으로 완료가 아니다. `docs/06_ACCEPTANCE_CRITERIA.md`의 필수 기준, `docs/07_QA_PLAN.md`의 증거, `docs/11_RELEASE_CHECKLIST.md`의 릴리스 게이트가 모두 충족되어야 한다.
