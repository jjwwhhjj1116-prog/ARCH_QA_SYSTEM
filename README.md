# FIN & RC 물량 검수 스튜디오

산출서와 집계표를 프로젝트 단위로 등록하고, 결정론 규칙과 근거를 이용해 FIN·RC 물량을 검토하기 위한 한국어 웹 애플리케이션입니다.

## 현재 상태

**로컬 수직 슬라이스 구현 중 — 프로덕션 배포 불가**

현재 실제로 동작하는 범위:

- 고정 텍스트 내비게이션과 반응형 한국어 검수 워크벤치
- 프로젝트 생성·검색·선택·재접속 복원
- 프로젝트별 FIN/RC 검수 케이스 생성·조회·복원
- D1 프로젝트·멤버십·검수 케이스·감사 이벤트 스키마
- 멤버십 기반 프로젝트/케이스 접근 제어
- 요청 크기·콘텐츠 유형·동일 사이트 mutation 경계
- 산출서와 집계표 묶음 생성, XLSX/CSV 다중 선택과 파일별 업로드 상태
- 단일 바이트 스냅샷에서 크기·SHA-256·선언 형식을 검증하는 비공개 R2 저장
- XLSX ZIP 구조·CRC·압축 해제 한도·경로·중복 엔트리·매크로·ActiveX·임베딩 차단
- CSV UTF-8·NUL·ZIP 위장·빈 파일 차단
- 프로젝트·검수 케이스·파일 버전을 결속한 D1 계보와 케이스 범위 멱등성
- unit/API/migration/E2E/accessibility/security 자동 검증

아직 구현되지 않은 핵심 범위:

- XLSX 시트 목록·차원·병합셀·수식·헤더 후보·제한된 셀 미리보기
- CSV 구분자·인코딩 자동 판별과 사용자 재지정
- 컬럼 매핑, 정규화, canonical dataset/row와 import diagnostics
- 프로젝트 코드 추출과 파일 묶음 identity 일치·충돌 판정
- 자동 R2/D1 orphan reconciliation, 만료·중단 업로드 정리와 상태 조회
- 조적 전면 제외와 부위 하드룰을 포함한 FIN 결정론 검수
- RC 규칙, Finding/Evidence, 조정·재실행
- 보고서·승인·감사 관리
- 실제 Sites identity 및 원격 D1/R2 연결

따라서 현재 앱은 **검수 엔진을 담을 보안 골격**이며 완성된 물량 검수 제품이 아닙니다. Cloudflare 연결과 배포는 사용자 지시에 따라 보류하고, 다음 개발은 로컬 ingestion과 결정론 검수 엔진을 우선합니다.

## 로컬 실행

요구사항: Node.js 22.13 이상

```powershell
npm ci
npm run db:migrate:local
$env:LOCAL_DEMO_MODE = 'true'
npm run dev
```

브라우저에서 터미널에 표시된 로컬 주소를 엽니다. `LOCAL_DEMO_MODE`는 로컬 개발 전용이며, 프로덕션 빌드는 검증된 identity header가 없으면 fail-closed 됩니다.

## 전체 검증

```powershell
npm run check:full
```

이 명령은 lint, format, TypeScript, unit/API test, production build, coverage, D1 migration 재현, Playwright 4개 viewport, axe와 production dependency audit를 실행합니다.

확정 기준선은 [Phase 1 QA manifest](artifacts/qa/phase-1/manifest.md)에 있습니다. 현재 업로드 경계의 로컬 검증은 [Phase 2A QA manifest](artifacts/qa/phase-2/manifest.md)와 [acceptance matrix](artifacts/qa/phase-2/acceptance-matrix.md)에 기록했습니다. Phase 2 전체와 제품 배포 판정은 여전히 NO-GO입니다.

## 주요 구현 경로

| 경로                          | 역할                                       |
| ----------------------------- | ------------------------------------------ |
| `app/review-studio.tsx`       | 프로젝트·검수 케이스 워크벤치              |
| `app/api/projects/`           | 프로젝트와 케이스 HTTP API                 |
| `app/api/uploads/`            | 권한 재검사·제한된 바이트 업로드 API       |
| `lib/auth/`                   | 요청 actor 해석과 production fail-closed   |
| `lib/http/`                   | 공통 요청 경계와 오류 envelope             |
| `lib/projects/`, `lib/cases/` | application service와 repository           |
| `lib/files/`                  | private R2 저장 포트와 무결성 계약         |
| `lib/ingestion/`              | source package·업로드 상태·D1 계보         |
| `lib/imports/`                | XLSX/CSV 구조 안전 검사(의미 파서 아님)    |
| `db/`, `drizzle/`             | D1 schema와 canonical migration            |
| `tests/e2e/`                  | 반응형·접근성·권한 브라우저 흐름           |
| `docs/`                       | 전체 PRD, 아키텍처, 검수 엔진 및 보안 계약 |
| `tasks/BACKLOG.md`            | 구현 단계와 실제 상태                      |

## 배포 경계

- `.openai/hosting.json`은 논리적 binding 이름 `DB`와 `FILES`만 선언합니다.
- `npm run build`은 Sites 산출물과 `dist/.openai/drizzle` migration을 생성합니다.
- 실제 Cloudflare resource provisioning, Sites candidate 저장, audience 검증 및 production deploy는 하지 않습니다.
- 배포는 별도의 보안·QA gate와 사용자 명시 승인 후에만 가능합니다.

## 최상위 기준 문서

- [START_HERE.md](START_HERE.md)
- [AGENTS.md](AGENTS.md)
- [Master PRD](docs/00_MASTER_PRD.md)
- [Architecture](docs/02_ARCHITECTURE.md)
- [Review engine contract](docs/04_REVIEW_ENGINE.md)
- [Acceptance criteria](docs/06_ACCEPTANCE_CRITERIA.md)
- [Security and privacy](docs/09_SECURITY_AND_PRIVACY.md)

제품 문구에서는 업로드 대상을 “FIN 자료”가 아니라 **“산출서와 집계표”**로 표현합니다.
