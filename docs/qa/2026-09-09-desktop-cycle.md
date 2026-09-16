# Windows 일반검수 한 사이클 검증

## 범위와 소스

- 프로젝트 ARCH_QA_SYSTEM, main / HEAD `33e3c06b87a65a5207fa22cf3c21eb961373f1a0` + 미커밋 구현 변경.
- 기획 기준 `../WEB_DESKTOP_PLAN.md` 12절. 기존 변경은 보존하며 새 커밋/운영 배포하지 않음.
- 내부 로컬 기본검수 시험. 정식 출시 전체 게이트는 NO-GO(수동매핑/AI·동기화/설치·서명·업데이트 등 미완료).
- 에이전트: wd_package(패키징), wd_ui_regression(UI 상태), wd_gate_audit(독립 검수), main(통합·회원 E2E·보고서).

## 이번 수정과 발견사항

1. 독립 검수 P1 원본 덮어쓰기: `saveNewReport`의 배타 생성 `wx`로 기존 파일 저장 차단. 원본과 기존 보고서 모두 새 이름 필요.
2. P1 0건 보고서 출처: 실제 프로젝트/실행 회원, 전체 원본 버전·SHA·시트/기준셀, 매핑 스냅샷 추가. 사례/지침 식별자도 범위 시트에 포함.
3. UI 늦은 응답: 로그아웃/취소/계정 전환 후 과거 검수 결과 재등장 차단. 기존 근거·제한·실행 ID 즉시 정리.
4. main 검수 요청 중복 잠금, 취소 epoch, 작업 후 권한 재조회. 화면에는 실제 coverage/sourceRefs 전달.
5. NSIS 상위 웹 의존성 전체 수집 문제: 독립 bundle 프로젝트로 패키징. 원격 페이지에 Node/로컬 파일 권한 부여하지 않음.

## 실행 증거

- `npm test`: 최종 62파일 / 524테스트 PASS (main 실제 핸들러 모의 IPC 6개 포함).
- `npm run typecheck`, 범위 `oxlint`, `npm run desktop:build`: PASS.
- `tools/smoke-desktop-cycle.mjs <사용자명단> <bundled-python>` 실제 Electron 개발 bundle 실행:
  - 기존 승인 관리자 1명·직원 1명 로그인/서버 역할 확인 PASS.
  - 실제 접근 가능한 가상자료 프로젝트 선택, 합성산출서.csv 처리.
  - BASIC-SYNTAX 1/0 후보 → 우측 원본 위치/근거 → 분석표 저장 PASS, 계정별 2사이클.
  - 원본 경로로 출력 시 거절, 실행 전후 원본 SHA 동일.
  - 로그아웃 이후 session/export 거절, 이전 근거 제거 PASS.
  - 시험 중 서버 변경은 로그인/로그아웃뿐. 프로젝트/원본/규칙/회사 키/Drive 변경 없음, AI 호출 0회.
  - 파일 열기/저장 OS 대화상자는 합성경로 응답으로 대체함. 네이티브 대화상자 수동 조작은 미검증.
- 출력/스크린샷: `output/playwright/desktop-cycle-bf4ae03f-551d-40d7-a33a-1cbaf14ca24f/`.
- 패키징된 `desktop/release/win-unpacked/CONCOST QC Studio.exe`에서도 동일 관리자/직원 2사이클 PASS.
  증거: `output/playwright/desktop-cycle-1cc87213-dcde-46eb-8d0b-92a7d6f9d1c5/`.
  이것은 압축 해제된 배포 EXE 실행이며 Setup 설치 마법사 실행 증거와 다르다.
- 생성 XLSX를 bundled Python openpyxl로 읽기 전용 재열기: 3시트/1후보/실행 수식 없음 PASS. 실제 Microsoft Excel UI 열기는 미검증.

첫 smoke 실패는 비표준 영문 파일명이 자동 자료종류 매핑에서 제외된 것이 원인.
이를 정상 판정으로 바꾸지 않았다. 지원되는 `합성산출서.csv`로 주 경로를 시험했고,
비표준/미매핑은 core 회귀에서 미평가와 출처 보존을 확인한다. 수동 매핑 구현 필요.

## 게이트와 다음 시작점

최종 내부 시험 설치물: `desktop/release/CONCOST-QC-Internal-Preview-Setup-0.1.0.exe`
(111,524,939 bytes, 무서명 / 자동업데이트 비활성).
SHA-256: `10c4e1825dd27b8aa8fcd6e9f380cd99134ed673ee877724a151bfede8fd96da`.
`desktop/release/package-manifest.json`에 포함 파일과 Electron/Chromium 고지의 SHA를 기록했다.
실제 bundle 의존성 12개의 라이선스 고지를 포함한다.
최종 포맷/정적 검사 후 재빌드한 모든 배포 파일이 manifest와 일치함을 확인했다.
최종 패키지 시작 및 미로그인 차단 PASS. Setup 마법사 설치/제거는 미검증이다.

| 기준 | 상태/범위 |
|---|---|
| AUTH-001/008 | 실제 지정 관리자/직원 로그인·로그아웃 PASS. 전체 역할 변경/세션 만료 운영 시나리오는 미검증 |
| AUTH-004 / RUN-008 | actual main IPC 모의 회귀 6개 PASS: 미로그인/조회자/다른 창·문서/동시실행/취소 및 로그아웃 이후 늦은 결과 |
| FILE-004 / REP-003 | 기존 안전 파서·inline string export 유지, 원본 덮어쓰기 거절/출력 수식 없음 확인 |
| REP-001/002/006 | 로컬 trial 출처·수준·미평가 보강. 서버 승인 이력/공유·정식 보고서는 미구현 |
| UI-003 / RULE-002 | UI 12개 상태 회귀 및 core 미매핑/0건 출처 테스트 PASS |
| REL-001 | 정식 출시 NO-GO: dirty source, 전체 접근성/대형 원본/설치·업데이트·승인 미충족 |

다음 구현은 수동 매핑→관리자 일반 지침→회사 AI→결과 Drive 동기화 순서.
건설사별 기준서는 확장 기능으로 뒤에 둔다. 작업자는 기획서·백로그·이 문서를 대조하고
현재 PC 브랜치/HEAD/dirty 및 패키지 manifest가 일치하는지 먼저 확인한다.

독립 검수 최종 판정: 로컬 기본검수 한 사이클 범위 한정 PASS.
관리자/직원 화면과 양쪽 XLSX를 별도로 열어 수준 A·원본 위치·SHA·프로젝트·매핑·AI 미사용을 확인했다.
정식 제품 전체는 NO-GO 유지. Windows Setup 설치/제거·발행자 서명·자동업데이트,
실제 Excel UI, 전체 접근성/대형 원본과 수동 매핑·관리자 지침/AI/동기화는 미완료다.
