# 등록 원본 PC 연결 기반 · Setup 무반응 조사

기준 main / 33e3c06b87a65a5207fa22cf3c21eb961373f1a0 + 기존 미커밋 변경 보존.
운영 API/DB/Drive 변경·배포·유료 AI 호출 없음. Setup 교체 없음.

## 변경과 검증

- desktop/registered-source.ts: 지정 프로젝트/자료 기록/묶음/원본 버전 조회,
  uploaded 원본만 1MiB 범위 다운로드, 기존 다운로드 함수의 SHA 검증 재사용.
- 전송 전후 목록 재조회, 제외·교체·중복·크기 초과·계정 변경 차단. 마지막 비동기
  해시 후 재인증 확인은 독립 검토 P2 지적을 반영해 회귀 추가.
- desktop/core.ts: 등록 원본 해시·프로젝트/자료 기록 검증, 원본 버전과 계보를 로컬
  매핑/결과에 보존. 서버 검사 완료나 승인으로 승격하지 않음.
- 합성 다운로드→실제 로컬 검사→XLSX 생성 테스트 통과. 화면/IPC 연결은 미구현.
- `npm test`: 65파일 / 584테스트 PASS (09:56 KST). `npm run typecheck`,
  `npm run desktop:build`, 변경 파일 oxlint/oxfmt PASS.
- 부분 수용 근거: FILE-002/009, NORM-007, AUTH-002 관련 클라이언트 방어 회귀.
  실제 서버 권한/사용자 흐름을 검증한 것이 아님. 마이그레이션 없음.

## 설치본 조사

- 담당 installer_diagnose_0910b: tools/smoke-desktop-installer.mjs 추가.
- 실제 NSIS Setup 0.1.2에서 앱을 추출하고 manifest/SHA 확인 후 격리 프로필로 시작 PASS.
- evidence: output/playwright/desktop-installer-pGweH8/result.json, startup.png.
- sha256: 2ac981636ae621e08ed6b1d169fa3ea3dddd941b98db7cc33842efd131eddd69.
- packaged/version/preload IPC/로그인 버튼 정상, pageErrors 없음. 외부 네트워크 차단 시험.
- 샌드박스 실행 두 번 빈 창 timeout, 승인된 실행에서 PASS. 사용자 장애 원인으로 단정 불가.
- 사용자 답변: 클릭해도 아무 반응 없음. 메인 Computer Use로 실제 Setup 실행을 시도했으나
  `Computer Use app approval timed out`. 설치 마법사/설치·제거/재설치는 미검증.
- 무서명이며 로컬 Zone.Identifier 없음. SmartScreen이 원인이라는 증거 없음.

## 다음 시작

Setup 실행 승인 후 창/프로세스 상태로 원인 확인. 별도로 등록 원본 선택→인증된
메인 IPC→격리 작업 프로세스를 연결하고 실제 앱 E2E. 새 전송 모듈은 0.1.2 Setup에
포함되거나 사용자 화면에서 작동하는 기능으로 보고하지 않는다.

## 등록 원본 선택 UI 동작 기록 (후속 연결 작업)

아래는 현재 `desktop/ui/index.html`, `app.js`, `style.css`에서 확인한 화면 동작이다.
위 초기 조사 시점의 구현·검증 기록과 구분하며, 최신 통합 검증 결과는 별도 증거로 확인한다.
기존 `DESIGN.md`의 설치형 색상·상태 지침으로 충분하므로 해당 파일과 디자인 sidecar는 이 문서화 작업에서 변경하지 않았다.

- 상단 `등록 원본 가져오기`를 누르면 현재 프로젝트의 작업 목록 위에 인라인 선택 영역을 연다. 자료 기록 → 등록 파일 → `선택 원본 가져오기` 순서이며 파일명·묶음명·크기를 함께 표시한다.
- 자료 기록·파일 선택은 기존 연노랑 입력 스타일, 가져오기 실행은 파랑을 재사용한다. 흰 패널과 기존 도구 모음은 유지하며 좁은 폭에서는 선택 영역과 버튼이 줄바꿈된다.
- 목록 조회·가져오기 진행, 빈 자료 기록·빈 파일 목록, 실패와 재시도 안내를 색상뿐 아니라 문구로 표시한다. 조회 후 자료 기록 선택으로 포커스를 옮기고 닫으면 열기 버튼으로 돌려준다.
- 기존 선택 파일이나 매핑 편집이 있으면 교체 전에 확인을 받는다. 가져오기 실패 시 기존 선택과 매핑을 보존하며 원본 파일 삭제로 표현하지 않는다.
- 가져온 자료는 `등록 원본 · 서버 검수 대기 / PC 실행 전`, 실행 결과는 PC 기본검사 및 `서버 미저장 / AI 미사용`으로 구분한다. 가져오기·PC 검사 완료를 서버 검수·AI 검수·승인 완료로 승격하지 않는다.

이 기록은 UI 코드 확인에 한정된다. 운영 서버·실자료 실증, 설치본 갱신, 전체 접근성·색상 대비 검증이나 제품 출시 승인을 뜻하지 않는다.

## 후속 통합 검증 완료 (2026-09-10 10:21 KST)

- 초기의 화면/IPC 미연결 상태를 해소했다. `qc:cloudSources`, `qc:importSource`를 인증
  메인 프로세스에 추가하고 원본 바이트는 렌더러에 전달하지 않는다. worker는 기존
  파서/일반검수 엔진을 사용한다. 원본 버전·자료 기록·해시를 유지한다.
- FIN 자료 기록만 선택하며 제외/교체/계정 변경/권한/취소를 다시 확인한다. 검사 결과를
  반환하기 전과 XLSX 저장 시에도 등록 상태를 확인한다. 서버 상태 승격/원본 변경 없음.
- 65파일 / 593테스트 PASS (10:19 재실행). typecheck, 변경 코드 oxlint/oxfmt,
  desktop build PASS. 새 회귀는 바이트 비노출·작업자 계보·제외 파일·viewer·동시 가져오기·
  로그아웃 중 도착 응답을 포함한다.
- `node tools/smoke-desktop-cloud.mjs`: 실제 Electron/IPC/worker/XLSX 사용, 인증·서버는
  합성 응답. 가져오기→수동 매핑→B2의 1/0 검출→보고서 저장→로그아웃 후 출력 차단 PASS.
  첫 샌드박스 실행은 Playwright 내부 assertion 실패, 승인된 실행 두 번 PASS.
- 최종 증거: `output/playwright/desktop-cloud-fa2a123d-3c8f-4e8b-baa1-244836af5085/`
  `result.json`, `registered-analysis.xlsx`, `picker-1440.png`, `picker-1000.png`, `report.png`.
  report의 원본 SHA와 sourceVersionId 대조 PASS, pageErrors 없음. 실제 Drive/API 비용 없음.
- 독립 UI reviewer `cloud_picker_finish`: 이전 동일 UI 캡처
  `desktop-cloud-7bd6bcf7-1ece-4347-8166-e74adfe3bf29`와 코드에서 좁은 범위 ship 판정.
  UI documenter는 이 문서에 동작을 기록하고 기존 디자인 문서를 보존했다.
- 별도 IPC reviewer는 사용량 한도로 실패하여 독립 백엔드 검수 완료로 표시하지 않는다.
  메인의 코드 확인/회귀/통합 검증으로 대체했다. UI detector는 parser 없음으로 regex
  DEGRADED, findings[]이며 대비/전체 접근성 통과 근거가 아니다.
- 서버 실인증/실제 Drive/대형 실자료/AI/Drive 보고서 동기화/Setup 설치는 미검증.
  실행 빌드는 갱신했지만 0.1.2 Setup은 교체하지 않았다. 버전 표기는 기존 시험판이며
  새로운 배포 버전이 아니다. 운영 배포·DB 변경·사용자 파일 삭제 없음.

다음 시작점: 설치 무반응의 실제 Setup 실행 관찰, 실인증 원본 가져오기, 이후 서버 검수
준비 경계와 회사 AI·Drive 결과 동기화. WD-07은 완료가 아니라 계속 진행 중이다.

## 실제 Setup 시작 재확인 (2026-09-10 후속)

- 동일 0.1.2 Setup SHA-256 재확인: 위 기록과 일치, NotSigned.
- Computer Use `sky.launch_app`로 해당 Setup 실행 성공. 반환된 설치 창을 대상으로
  UI Automation 트리에서 제품명/0.1.2/설치 옵션/현재 사용자만 새로 설치를 확인했다.
- `다음` 버튼 후 설치 위치 선택 단계에 도달했다. `설치` 버튼과 필요한 공간 368.1MB,
  남은 공간 141.6GB 확인. 아직 설치 버튼을 누르지 않았고 사용자 설치 승인 대기다.
- 현재 환경에서는 시작 무반응을 재현하지 못했다. 이전 무반응 원인이나 SmartScreen
  차단을 확정하지 않는다. 화면 캡처는 타 앱 내용이 표시되어 시각 증거로 채택하지 않고
  반환된 창 객체/대상 창 접근성 트리/다음 단계 전환을 관찰 근거로 사용했다.
- 독립 읽기 전용 agent `installer_review_next`: 패키징 확정 결함 없음. 추출 앱 smoke는
  설치 성공 증거가 아님을 재확인했다. smoke의 pageErrors 빈 배열 assert 누락과 앱
  whenReady/loadFile 실패 안내 부재는 별도 보강 후보이며 현재 증상의 원인으로 확정 안 함.
- 코드/Setup/운영 변경 없음. 다음은 사용자의 실제 설치 승인 후 설치 완료·설치된 앱 시작
  확인. 기존 추출 앱 검증과 구별해서 기록한다.
